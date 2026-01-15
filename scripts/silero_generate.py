#!/usr/bin/env python3
"""
Silero TTS Generation Script
Generates speech audio using Silero models
"""

import argparse
import os
import sys
import re
from pathlib import Path

try:
    import torch
except ImportError:
    print("Error: PyTorch not installed.", file=sys.stderr)
    print("Please install: pip install torch", file=sys.stderr)
    sys.exit(1)

try:
    import scipy.io.wavfile as wavfile
    import numpy as np
    from scipy import signal
except ImportError:
    print("Error: scipy/numpy not installed.", file=sys.stderr)
    print("Please install: pip install scipy numpy", file=sys.stderr)
    sys.exit(1)


def parse_rate(rate_str):
    """Parse rate string like '+50%' or '-25%' to a multiplier."""
    if not rate_str:
        return 1.0
    match = re.match(r'^([+-])(\d+)%$', rate_str)
    if match:
        sign = match.group(1)
        percent = int(match.group(2))
        if sign == '+':
            return 1.0 + percent / 100
        else:
            return 1.0 - percent / 100
    return 1.0


def ssml_rate_to_keyword(rate_value):
    """Convert numeric rate (0.5-2.0) to SSML keyword."""
    if rate_value <= 0.6:
        return 'x-slow'
    elif rate_value <= 0.8:
        return 'slow'
    elif rate_value <= 1.2:
        return 'medium'
    elif rate_value <= 1.5:
        return 'fast'
    else:
        return 'x-fast'


def ssml_pitch_to_keyword(pitch_value):
    """Convert numeric pitch (0.5-2.0) to SSML keyword."""
    if pitch_value <= 0.6:
        return 'x-low'
    elif pitch_value <= 0.8:
        return 'low'
    elif pitch_value <= 1.2:
        return 'medium'
    elif pitch_value <= 1.5:
        return 'high'
    else:
        return 'x-high'


def wrap_with_ssml(text, rate=None, pitch=None):
    """Wrap text with SSML prosody tags if rate or pitch specified."""
    rate_kw = ssml_rate_to_keyword(rate) if rate else None
    pitch_kw = ssml_pitch_to_keyword(pitch) if pitch else None

    # Only wrap if non-default values
    needs_wrap = (rate_kw and rate_kw != 'medium') or (pitch_kw and pitch_kw != 'medium')

    if not needs_wrap:
        return text, False

    prosody_attrs = []
    if rate_kw and rate_kw != 'medium':
        prosody_attrs.append(f'rate="{rate_kw}"')
    if pitch_kw and pitch_kw != 'medium':
        prosody_attrs.append(f'pitch="{pitch_kw}"')

    attrs_str = ' '.join(prosody_attrs)
    ssml_text = f'<speak><prosody {attrs_str}>{text}</prosody></speak>'
    return ssml_text, True


def time_stretch(audio, factor):
    """
    Time stretch audio by resampling.
    Factor > 1.0 = faster (shorter duration)
    Factor < 1.0 = slower (longer duration)
    Note: This also affects pitch (higher factor = higher pitch).
    """
    if factor == 1.0:
        return audio
    new_length = int(len(audio) / factor)
    return signal.resample(audio, new_length)


def main():
    parser = argparse.ArgumentParser(description='Generate speech using Silero TTS')
    parser.add_argument('--text', required=True, help='Text to convert to speech')
    parser.add_argument('--speaker', required=True, help='Speaker model (e.g., v3_1_ru/aidar)')
    parser.add_argument('--output', required=True, help='Output WAV file path')
    parser.add_argument('--sample-rate', type=int, default=48000, help='Sample rate (default: 48000)')
    parser.add_argument('--rate', type=str, default='', help='Speed adjustment via SSML (e.g., +50%%, -25%%, or numeric like 1.5)')
    parser.add_argument('--pitch', type=float, default=1.0, help='Pitch adjustment via SSML (0.5-2.0, default: 1.0)')
    parser.add_argument('--time-stretch', type=float, default=1.0, help='Post-processing time stretch via resampling (affects both speed and pitch, 0.5-2.0, default: 1.0)')

    args = parser.parse_args()

    try:
        # Parse speaker path
        parts = args.speaker.split('/')
        if len(parts) != 2:
            raise ValueError(f"Invalid speaker path format: {args.speaker}")

        model_id = parts[0]  # e.g., 'v5_ru' or 'v3_en'
        speaker = parts[1]    # e.g., 'aidar', 'baya', etc.

        # Determine language
        if 'ru' in model_id:
            language = 'ru'
            model_name = 'v5_ru'
        elif 'en' in model_id:
            language = 'en'
            model_name = 'v3_en'
        else:
            raise ValueError(f"Unknown language in model: {model_id}")

        print(f"Loading Silero model: {model_name}, speaker: {speaker}", file=sys.stderr)

        # Load Silero model from torch hub
        device = torch.device('cpu')  # Use CPU for compatibility

        # Load model
        model, example_text = torch.hub.load(
            repo_or_dir='snakers4/silero-models',
            model='silero_tts',
            language=language,
            speaker=model_name
        )

        model.to(device)

        print(f"Generating audio for text length: {len(args.text)} characters", file=sys.stderr)

        # Parse rate value
        rate_value = parse_rate(args.rate) if args.rate else 1.0
        pitch_value = args.pitch

        # Wrap text with SSML if non-default rate or pitch
        ssml_text, use_ssml = wrap_with_ssml(args.text, rate_value, pitch_value)

        if use_ssml:
            print(f"Using SSML with rate={ssml_rate_to_keyword(rate_value)}, pitch={ssml_pitch_to_keyword(pitch_value)}", file=sys.stderr)
            audio = model.apply_tts(
                ssml_text=ssml_text,
                speaker=speaker,
                sample_rate=args.sample_rate
            )
        else:
            audio = model.apply_tts(
                text=args.text,
                speaker=speaker,
                sample_rate=args.sample_rate,
                put_accent=True,
                put_yo=True
            )

        # Save to WAV file
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        # Convert to numpy array
        if isinstance(audio, torch.Tensor):
            audio = audio.numpy()

        # Ensure 1D array for mono
        if audio.ndim > 1:
            audio = audio.squeeze()

        # Apply time stretch if specified (post-processing resampling)
        if args.time_stretch != 1.0:
            print(f"Applying time stretch: {args.time_stretch}x", file=sys.stderr)
            audio = time_stretch(audio, args.time_stretch)

        # Normalize to int16 range
        audio = (audio * 32767).astype(np.int16)

        # Save using scipy
        wavfile.write(str(output_path), args.sample_rate, audio)

        print(f"Successfully generated audio: {args.output}", file=sys.stderr)
        return 0

    except Exception as e:
        print(f"Error generating audio: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
