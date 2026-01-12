import fs from 'fs'
import path from 'path'
import { exec, spawn } from 'child_process'
import { promisify } from 'util'
import { app } from 'electron'
import { checkSileroInstalled, checkCoquiInstalled, getInstalledRHVoices } from './setup'

const execAsync = promisify(exec)

export type TTSProvider = 'rhvoice' | 'piper' | 'silero' | 'elevenlabs' | 'coqui'

export interface VoiceInfo {
  name: string
  shortName: string
  gender: 'Male' | 'Female'
  locale: string
  provider: TTSProvider
  modelPath?: string // For Piper and Silero
  voiceId?: string // For ElevenLabs
  isInstalled?: boolean // For RHVoice and Piper
}

// RHVoice configurations (Windows SAPI)
const RHVOICE_VOICES: Record<string, VoiceInfo[]> = {
  'ru-RU': [
    { name: 'Aleksandr', shortName: 'Aleksandr', gender: 'Male', locale: 'ru-RU', provider: 'rhvoice' },
    { name: 'Irina', shortName: 'Irina', gender: 'Female', locale: 'ru-RU', provider: 'rhvoice' },
    { name: 'Anna', shortName: 'Anna', gender: 'Female', locale: 'ru-RU', provider: 'rhvoice' },
    { name: 'Elena', shortName: 'Elena', gender: 'Female', locale: 'ru-RU', provider: 'rhvoice' }
  ],
  'en': [
    { name: 'Bdl', shortName: 'Bdl', gender: 'Male', locale: 'en', provider: 'rhvoice' },
    { name: 'Slt', shortName: 'Slt', gender: 'Female', locale: 'en', provider: 'rhvoice' },
    { name: 'Clb', shortName: 'Clb', gender: 'Female', locale: 'en', provider: 'rhvoice' },
    { name: 'Alan', shortName: 'Alan', gender: 'Male', locale: 'en', provider: 'rhvoice' }
  ]
}

// Piper voice configurations
const PIPER_VOICES: Record<string, VoiceInfo[]> = {
  'ru-RU': [
    {
      name: 'Denis',
      shortName: 'piper-denis',
      gender: 'Male',
      locale: 'ru-RU',
      provider: 'piper',
      modelPath: 'ru_RU/denis/medium/ru_RU-denis-medium.onnx'
    },
    {
      name: 'Dmitri',
      shortName: 'piper-dmitri',
      gender: 'Male',
      locale: 'ru-RU',
      provider: 'piper',
      modelPath: 'ru_RU/dmitri/medium/ru_RU-dmitri-medium.onnx'
    },
    {
      name: 'Irina',
      shortName: 'piper-irina',
      gender: 'Female',
      locale: 'ru-RU',
      provider: 'piper',
      modelPath: 'ru_RU/irina/medium/ru_RU-irina-medium.onnx'
    },
    {
      name: 'Ruslan',
      shortName: 'piper-ruslan',
      gender: 'Male',
      locale: 'ru-RU',
      provider: 'piper',
      modelPath: 'ru_RU/ruslan/medium/ru_RU-ruslan-medium.onnx'
    }
  ],
  'en': [
    {
      name: 'Amy',
      shortName: 'piper-amy',
      gender: 'Female',
      locale: 'en',
      provider: 'piper',
      modelPath: 'en_US/amy/low/en_US-amy-low.onnx'
    },
    {
      name: 'Lessac',
      shortName: 'piper-lessac',
      gender: 'Male',
      locale: 'en',
      provider: 'piper',
      modelPath: 'en_US/lessac/medium/en_US-lessac-medium.onnx'
    },
    {
      name: 'Ryan',
      shortName: 'piper-ryan',
      gender: 'Male',
      locale: 'en',
      provider: 'piper',
      modelPath: 'en_US/ryan/medium/en_US-ryan-medium.onnx'
    }
  ]
}

// Silero voice configurations
const SILERO_VOICES: Record<string, VoiceInfo[]> = {
  'ru-RU': [
    { name: 'Aidar', shortName: 'silero-aidar', gender: 'Male', locale: 'ru-RU', provider: 'silero', modelPath: 'v3_1_ru/aidar' },
    { name: 'Baya', shortName: 'silero-baya', gender: 'Female', locale: 'ru-RU', provider: 'silero', modelPath: 'v3_1_ru/baya' },
    { name: 'Kseniya', shortName: 'silero-kseniya', gender: 'Female', locale: 'ru-RU', provider: 'silero', modelPath: 'v3_1_ru/kseniya' },
    { name: 'Xenia', shortName: 'silero-xenia', gender: 'Female', locale: 'ru-RU', provider: 'silero', modelPath: 'v3_1_ru/xenia' },
    { name: 'Eugene', shortName: 'silero-eugene', gender: 'Male', locale: 'ru-RU', provider: 'silero', modelPath: 'v3_1_ru/eugene' }
  ],
  'en': [
    { name: 'Female 1', shortName: 'silero-en-f1', gender: 'Female', locale: 'en', provider: 'silero', modelPath: 'v3_en/en_0' },
    { name: 'Female 2', shortName: 'silero-en-f2', gender: 'Female', locale: 'en', provider: 'silero', modelPath: 'v3_en/en_1' },
    { name: 'Male 1', shortName: 'silero-en-m1', gender: 'Male', locale: 'en', provider: 'silero', modelPath: 'v3_en/en_2' },
    { name: 'Male 2', shortName: 'silero-en-m2', gender: 'Male', locale: 'en', provider: 'silero', modelPath: 'v3_en/en_3' }
  ]
}

// ElevenLabs voice configurations
// Voice IDs from ElevenLabs API - these are the default voices available
const ELEVENLABS_VOICES: Record<string, VoiceInfo[]> = {
  'ru-RU': [
    { name: 'ElevenLabs Adam', shortName: 'elevenlabs-adam', gender: 'Male', locale: 'ru-RU', provider: 'elevenlabs', voiceId: 'pNInz6obpgDQGcFmaJgB' },
    { name: 'ElevenLabs Rachel', shortName: 'elevenlabs-rachel', gender: 'Female', locale: 'ru-RU', provider: 'elevenlabs', voiceId: '21m00Tcm4TlvDq8ikWAM' }
  ],
  'en': [
    { name: 'ElevenLabs Adam', shortName: 'elevenlabs-adam-en', gender: 'Male', locale: 'en', provider: 'elevenlabs', voiceId: 'pNInz6obpgDQGcFmaJgB' },
    { name: 'ElevenLabs Rachel', shortName: 'elevenlabs-rachel-en', gender: 'Female', locale: 'en', provider: 'elevenlabs', voiceId: '21m00Tcm4TlvDq8ikWAM' },
    { name: 'ElevenLabs Domi', shortName: 'elevenlabs-domi', gender: 'Female', locale: 'en', provider: 'elevenlabs', voiceId: 'AZnzlk1XvdvUeBnXmlld' },
    { name: 'ElevenLabs Bella', shortName: 'elevenlabs-bella', gender: 'Female', locale: 'en', provider: 'elevenlabs', voiceId: 'EXAVITQu4vr4xnSDxMaL' },
    { name: 'ElevenLabs Josh', shortName: 'elevenlabs-josh', gender: 'Male', locale: 'en', provider: 'elevenlabs', voiceId: 'TxGEqnHWrfWFTfGW9XjX' },
    { name: 'ElevenLabs Sam', shortName: 'elevenlabs-sam', gender: 'Male', locale: 'en', provider: 'elevenlabs', voiceId: 'yoZ06aMxZJJ28mfd3POQ' }
  ]
}


// Coqui XTTS-v2 voice configurations (built-in speakers)
const COQUI_VOICES: Record<string, VoiceInfo[]> = {
  'ru-RU': [
    { name: 'Claribel Dervla', shortName: 'coqui-claribel', gender: 'Female', locale: 'ru-RU', provider: 'coqui', modelPath: 'Claribel Dervla' },
    { name: 'Daisy Studious', shortName: 'coqui-daisy', gender: 'Female', locale: 'ru-RU', provider: 'coqui', modelPath: 'Daisy Studious' },
    { name: 'Gracie Wise', shortName: 'coqui-gracie', gender: 'Female', locale: 'ru-RU', provider: 'coqui', modelPath: 'Gracie Wise' },
    { name: 'Tammie Ema', shortName: 'coqui-tammie', gender: 'Female', locale: 'ru-RU', provider: 'coqui', modelPath: 'Tammie Ema' },
    { name: 'Alison Dietlinde', shortName: 'coqui-alison', gender: 'Female', locale: 'ru-RU', provider: 'coqui', modelPath: 'Alison Dietlinde' },
    { name: 'Ana Florence', shortName: 'coqui-ana', gender: 'Female', locale: 'ru-RU', provider: 'coqui', modelPath: 'Ana Florence' },
    { name: 'Annmarie Nele', shortName: 'coqui-annmarie', gender: 'Female', locale: 'ru-RU', provider: 'coqui', modelPath: 'Annmarie Nele' },
    { name: 'Asya Anara', shortName: 'coqui-asya', gender: 'Female', locale: 'ru-RU', provider: 'coqui', modelPath: 'Asya Anara' },
    { name: 'Brenda Stern', shortName: 'coqui-brenda', gender: 'Female', locale: 'ru-RU', provider: 'coqui', modelPath: 'Brenda Stern' },
    { name: 'Gitta Nikolina', shortName: 'coqui-gitta', gender: 'Female', locale: 'ru-RU', provider: 'coqui', modelPath: 'Gitta Nikolina' },
    { name: 'Henriette Usha', shortName: 'coqui-henriette', gender: 'Female', locale: 'ru-RU', provider: 'coqui', modelPath: 'Henriette Usha' },
    { name: 'Sofia Hellen', shortName: 'coqui-sofia', gender: 'Female', locale: 'ru-RU', provider: 'coqui', modelPath: 'Sofia Hellen' },
    { name: 'Tammy Grit', shortName: 'coqui-tammy', gender: 'Female', locale: 'ru-RU', provider: 'coqui', modelPath: 'Tammy Grit' },
    { name: 'Tanja Adelina', shortName: 'coqui-tanja', gender: 'Female', locale: 'ru-RU', provider: 'coqui', modelPath: 'Tanja Adelina' },
    { name: 'Vjollca Johnnie', shortName: 'coqui-vjollca', gender: 'Female', locale: 'ru-RU', provider: 'coqui', modelPath: 'Vjollca Johnnie' },
    { name: 'Andrew Chipper', shortName: 'coqui-andrew', gender: 'Male', locale: 'ru-RU', provider: 'coqui', modelPath: 'Andrew Chipper' },
    { name: 'Badr Odhiambo', shortName: 'coqui-badr', gender: 'Male', locale: 'ru-RU', provider: 'coqui', modelPath: 'Badr Odhiambo' },
    { name: 'Dionisio Schuyler', shortName: 'coqui-dionisio', gender: 'Male', locale: 'ru-RU', provider: 'coqui', modelPath: 'Dionisio Schuyler' },
    { name: 'Royston Min', shortName: 'coqui-royston', gender: 'Male', locale: 'ru-RU', provider: 'coqui', modelPath: 'Royston Min' },
    { name: 'Viktor Eka', shortName: 'coqui-viktor', gender: 'Male', locale: 'ru-RU', provider: 'coqui', modelPath: 'Viktor Eka' },
    { name: 'Abrahan Mack', shortName: 'coqui-abrahan', gender: 'Male', locale: 'ru-RU', provider: 'coqui', modelPath: 'Abrahan Mack' },
    { name: 'Adde Michal', shortName: 'coqui-adde', gender: 'Male', locale: 'ru-RU', provider: 'coqui', modelPath: 'Adde Michal' },
    { name: 'Baldur Sanjin', shortName: 'coqui-baldur', gender: 'Male', locale: 'ru-RU', provider: 'coqui', modelPath: 'Baldur Sanjin' },
    { name: 'Craig Gutsy', shortName: 'coqui-craig', gender: 'Male', locale: 'ru-RU', provider: 'coqui', modelPath: 'Craig Gutsy' },
    { name: 'Damien Black', shortName: 'coqui-damien', gender: 'Male', locale: 'ru-RU', provider: 'coqui', modelPath: 'Damien Black' },
    { name: 'Gilberto Mathias', shortName: 'coqui-gilberto', gender: 'Male', locale: 'ru-RU', provider: 'coqui', modelPath: 'Gilberto Mathias' },
    { name: 'Ilkin Urbano', shortName: 'coqui-ilkin', gender: 'Male', locale: 'ru-RU', provider: 'coqui', modelPath: 'Ilkin Urbano' },
    { name: 'Kazuhiko Atallah', shortName: 'coqui-kazuhiko', gender: 'Male', locale: 'ru-RU', provider: 'coqui', modelPath: 'Kazuhiko Atallah' },
    { name: 'Ludvig Milivoj', shortName: 'coqui-ludvig', gender: 'Male', locale: 'ru-RU', provider: 'coqui', modelPath: 'Ludvig Milivoj' },
    { name: 'Suad Qasim', shortName: 'coqui-suad', gender: 'Male', locale: 'ru-RU', provider: 'coqui', modelPath: 'Suad Qasim' },
    { name: 'Torcull Diarmuid', shortName: 'coqui-torcull', gender: 'Male', locale: 'ru-RU', provider: 'coqui', modelPath: 'Torcull Diarmuid' },
    { name: 'Viktor Menelaos', shortName: 'coqui-viktor-m', gender: 'Male', locale: 'ru-RU', provider: 'coqui', modelPath: 'Viktor Menelaos' },
    { name: 'Zacharie Aimilios', shortName: 'coqui-zacharie', gender: 'Male', locale: 'ru-RU', provider: 'coqui', modelPath: 'Zacharie Aimilios' },
    { name: 'Nova Hogarth', shortName: 'coqui-nova', gender: 'Female', locale: 'ru-RU', provider: 'coqui', modelPath: 'Nova Hogarth' },
    { name: 'Maja Ruoho', shortName: 'coqui-maja', gender: 'Female', locale: 'ru-RU', provider: 'coqui', modelPath: 'Maja Ruoho' },
    { name: 'Uta Obando', shortName: 'coqui-uta', gender: 'Female', locale: 'ru-RU', provider: 'coqui', modelPath: 'Uta Obando' },
    { name: 'Lidiya Szekeres', shortName: 'coqui-lidiya', gender: 'Female', locale: 'ru-RU', provider: 'coqui', modelPath: 'Lidiya Szekeres' },
    { name: 'Chandra MacFarland', shortName: 'coqui-chandra', gender: 'Female', locale: 'ru-RU', provider: 'coqui', modelPath: 'Chandra MacFarland' },
    { name: 'Szofi Granger', shortName: 'coqui-szofi', gender: 'Female', locale: 'ru-RU', provider: 'coqui', modelPath: 'Szofi Granger' },
    { name: 'Camber Rassington', shortName: 'coqui-camber', gender: 'Female', locale: 'ru-RU', provider: 'coqui', modelPath: 'Camber Rassington' },
    { name: 'Narelle Moon', shortName: 'coqui-narelle', gender: 'Female', locale: 'ru-RU', provider: 'coqui', modelPath: 'Narelle Moon' },
    { name: 'Barbora MacLean', shortName: 'coqui-barbora', gender: 'Female', locale: 'ru-RU', provider: 'coqui', modelPath: 'Barbora MacLean' },
    { name: 'Alexandra Hisakawa', shortName: 'coqui-alexandra', gender: 'Female', locale: 'ru-RU', provider: 'coqui', modelPath: 'Alexandra Hisakawa' },
    { name: 'Alma María', shortName: 'coqui-alma', gender: 'Female', locale: 'ru-RU', provider: 'coqui', modelPath: 'Alma María' },
    { name: 'Rosemary Okafor', shortName: 'coqui-rosemary', gender: 'Female', locale: 'ru-RU', provider: 'coqui', modelPath: 'Rosemary Okafor' },
    { name: 'Ige Behringer', shortName: 'coqui-ige', gender: 'Female', locale: 'ru-RU', provider: 'coqui', modelPath: 'Ige Behringer' },
    { name: 'Filip Traverse', shortName: 'coqui-filip', gender: 'Male', locale: 'ru-RU', provider: 'coqui', modelPath: 'Filip Traverse' },
    { name: 'Damjan Chapman', shortName: 'coqui-damjan', gender: 'Male', locale: 'ru-RU', provider: 'coqui', modelPath: 'Damjan Chapman' },
    { name: 'Wulf Carlevaro', shortName: 'coqui-wulf', gender: 'Male', locale: 'ru-RU', provider: 'coqui', modelPath: 'Wulf Carlevaro' },
    { name: 'Aaron Dreschner', shortName: 'coqui-aaron', gender: 'Male', locale: 'ru-RU', provider: 'coqui', modelPath: 'Aaron Dreschner' },
    { name: 'Kumar Dahl', shortName: 'coqui-kumar', gender: 'Male', locale: 'ru-RU', provider: 'coqui', modelPath: 'Kumar Dahl' },
    { name: 'Eugenio Mataracı', shortName: 'coqui-eugenio', gender: 'Male', locale: 'ru-RU', provider: 'coqui', modelPath: 'Eugenio Mataracı' },
    { name: 'Ferran Simen', shortName: 'coqui-ferran', gender: 'Male', locale: 'ru-RU', provider: 'coqui', modelPath: 'Ferran Simen' },
    { name: 'Xavier Hayasaka', shortName: 'coqui-xavier', gender: 'Male', locale: 'ru-RU', provider: 'coqui', modelPath: 'Xavier Hayasaka' },
    { name: 'Luis Moray', shortName: 'coqui-luis', gender: 'Male', locale: 'ru-RU', provider: 'coqui', modelPath: 'Luis Moray' },
    { name: 'Marcos Rudaski', shortName: 'coqui-marcos', gender: 'Male', locale: 'ru-RU', provider: 'coqui', modelPath: 'Marcos Rudaski' }
  ],
  'en': [
    { name: 'Claribel Dervla', shortName: 'coqui-claribel-en', gender: 'Female', locale: 'en', provider: 'coqui', modelPath: 'Claribel Dervla' },
    { name: 'Daisy Studious', shortName: 'coqui-daisy-en', gender: 'Female', locale: 'en', provider: 'coqui', modelPath: 'Daisy Studious' },
    { name: 'Gracie Wise', shortName: 'coqui-gracie-en', gender: 'Female', locale: 'en', provider: 'coqui', modelPath: 'Gracie Wise' },
    { name: 'Tammie Ema', shortName: 'coqui-tammie-en', gender: 'Female', locale: 'en', provider: 'coqui', modelPath: 'Tammie Ema' },
    { name: 'Alison Dietlinde', shortName: 'coqui-alison-en', gender: 'Female', locale: 'en', provider: 'coqui', modelPath: 'Alison Dietlinde' },
    { name: 'Ana Florence', shortName: 'coqui-ana-en', gender: 'Female', locale: 'en', provider: 'coqui', modelPath: 'Ana Florence' },
    { name: 'Annmarie Nele', shortName: 'coqui-annmarie-en', gender: 'Female', locale: 'en', provider: 'coqui', modelPath: 'Annmarie Nele' },
    { name: 'Asya Anara', shortName: 'coqui-asya-en', gender: 'Female', locale: 'en', provider: 'coqui', modelPath: 'Asya Anara' },
    { name: 'Brenda Stern', shortName: 'coqui-brenda-en', gender: 'Female', locale: 'en', provider: 'coqui', modelPath: 'Brenda Stern' },
    { name: 'Gitta Nikolina', shortName: 'coqui-gitta-en', gender: 'Female', locale: 'en', provider: 'coqui', modelPath: 'Gitta Nikolina' },
    { name: 'Henriette Usha', shortName: 'coqui-henriette-en', gender: 'Female', locale: 'en', provider: 'coqui', modelPath: 'Henriette Usha' },
    { name: 'Sofia Hellen', shortName: 'coqui-sofia-en', gender: 'Female', locale: 'en', provider: 'coqui', modelPath: 'Sofia Hellen' },
    { name: 'Tammy Grit', shortName: 'coqui-tammy-en', gender: 'Female', locale: 'en', provider: 'coqui', modelPath: 'Tammy Grit' },
    { name: 'Tanja Adelina', shortName: 'coqui-tanja-en', gender: 'Female', locale: 'en', provider: 'coqui', modelPath: 'Tanja Adelina' },
    { name: 'Vjollca Johnnie', shortName: 'coqui-vjollca-en', gender: 'Female', locale: 'en', provider: 'coqui', modelPath: 'Vjollca Johnnie' },
    { name: 'Andrew Chipper', shortName: 'coqui-andrew-en', gender: 'Male', locale: 'en', provider: 'coqui', modelPath: 'Andrew Chipper' },
    { name: 'Badr Odhiambo', shortName: 'coqui-badr-en', gender: 'Male', locale: 'en', provider: 'coqui', modelPath: 'Badr Odhiambo' },
    { name: 'Dionisio Schuyler', shortName: 'coqui-dionisio-en', gender: 'Male', locale: 'en', provider: 'coqui', modelPath: 'Dionisio Schuyler' },
    { name: 'Royston Min', shortName: 'coqui-royston-en', gender: 'Male', locale: 'en', provider: 'coqui', modelPath: 'Royston Min' },
    { name: 'Viktor Eka', shortName: 'coqui-viktor-en', gender: 'Male', locale: 'en', provider: 'coqui', modelPath: 'Viktor Eka' },
    { name: 'Abrahan Mack', shortName: 'coqui-abrahan-en', gender: 'Male', locale: 'en', provider: 'coqui', modelPath: 'Abrahan Mack' },
    { name: 'Adde Michal', shortName: 'coqui-adde-en', gender: 'Male', locale: 'en', provider: 'coqui', modelPath: 'Adde Michal' },
    { name: 'Baldur Sanjin', shortName: 'coqui-baldur-en', gender: 'Male', locale: 'en', provider: 'coqui', modelPath: 'Baldur Sanjin' },
    { name: 'Craig Gutsy', shortName: 'coqui-craig-en', gender: 'Male', locale: 'en', provider: 'coqui', modelPath: 'Craig Gutsy' },
    { name: 'Damien Black', shortName: 'coqui-damien-en', gender: 'Male', locale: 'en', provider: 'coqui', modelPath: 'Damien Black' },
    { name: 'Gilberto Mathias', shortName: 'coqui-gilberto-en', gender: 'Male', locale: 'en', provider: 'coqui', modelPath: 'Gilberto Mathias' },
    { name: 'Ilkin Urbano', shortName: 'coqui-ilkin-en', gender: 'Male', locale: 'en', provider: 'coqui', modelPath: 'Ilkin Urbano' },
    { name: 'Kazuhiko Atallah', shortName: 'coqui-kazuhiko-en', gender: 'Male', locale: 'en', provider: 'coqui', modelPath: 'Kazuhiko Atallah' },
    { name: 'Ludvig Milivoj', shortName: 'coqui-ludvig-en', gender: 'Male', locale: 'en', provider: 'coqui', modelPath: 'Ludvig Milivoj' },
    { name: 'Suad Qasim', shortName: 'coqui-suad-en', gender: 'Male', locale: 'en', provider: 'coqui', modelPath: 'Suad Qasim' },
    { name: 'Torcull Diarmuid', shortName: 'coqui-torcull-en', gender: 'Male', locale: 'en', provider: 'coqui', modelPath: 'Torcull Diarmuid' },
    { name: 'Viktor Menelaos', shortName: 'coqui-viktor-m-en', gender: 'Male', locale: 'en', provider: 'coqui', modelPath: 'Viktor Menelaos' },
    { name: 'Zacharie Aimilios', shortName: 'coqui-zacharie-en', gender: 'Male', locale: 'en', provider: 'coqui', modelPath: 'Zacharie Aimilios' },
    { name: 'Nova Hogarth', shortName: 'coqui-nova-en', gender: 'Female', locale: 'en', provider: 'coqui', modelPath: 'Nova Hogarth' },
    { name: 'Maja Ruoho', shortName: 'coqui-maja-en', gender: 'Female', locale: 'en', provider: 'coqui', modelPath: 'Maja Ruoho' },
    { name: 'Uta Obando', shortName: 'coqui-uta-en', gender: 'Female', locale: 'en', provider: 'coqui', modelPath: 'Uta Obando' },
    { name: 'Lidiya Szekeres', shortName: 'coqui-lidiya-en', gender: 'Female', locale: 'en', provider: 'coqui', modelPath: 'Lidiya Szekeres' },
    { name: 'Chandra MacFarland', shortName: 'coqui-chandra-en', gender: 'Female', locale: 'en', provider: 'coqui', modelPath: 'Chandra MacFarland' },
    { name: 'Szofi Granger', shortName: 'coqui-szofi-en', gender: 'Female', locale: 'en', provider: 'coqui', modelPath: 'Szofi Granger' },
    { name: 'Camber Rassington', shortName: 'coqui-camber-en', gender: 'Female', locale: 'en', provider: 'coqui', modelPath: 'Camber Rassington' },
    { name: 'Narelle Moon', shortName: 'coqui-narelle-en', gender: 'Female', locale: 'en', provider: 'coqui', modelPath: 'Narelle Moon' },
    { name: 'Barbora MacLean', shortName: 'coqui-barbora-en', gender: 'Female', locale: 'en', provider: 'coqui', modelPath: 'Barbora MacLean' },
    { name: 'Alexandra Hisakawa', shortName: 'coqui-alexandra-en', gender: 'Female', locale: 'en', provider: 'coqui', modelPath: 'Alexandra Hisakawa' },
    { name: 'Alma María', shortName: 'coqui-alma-en', gender: 'Female', locale: 'en', provider: 'coqui', modelPath: 'Alma María' },
    { name: 'Rosemary Okafor', shortName: 'coqui-rosemary-en', gender: 'Female', locale: 'en', provider: 'coqui', modelPath: 'Rosemary Okafor' },
    { name: 'Ige Behringer', shortName: 'coqui-ige-en', gender: 'Female', locale: 'en', provider: 'coqui', modelPath: 'Ige Behringer' },
    { name: 'Filip Traverse', shortName: 'coqui-filip-en', gender: 'Male', locale: 'en', provider: 'coqui', modelPath: 'Filip Traverse' },
    { name: 'Damjan Chapman', shortName: 'coqui-damjan-en', gender: 'Male', locale: 'en', provider: 'coqui', modelPath: 'Damjan Chapman' },
    { name: 'Wulf Carlevaro', shortName: 'coqui-wulf-en', gender: 'Male', locale: 'en', provider: 'coqui', modelPath: 'Wulf Carlevaro' },
    { name: 'Aaron Dreschner', shortName: 'coqui-aaron-en', gender: 'Male', locale: 'en', provider: 'coqui', modelPath: 'Aaron Dreschner' },
    { name: 'Kumar Dahl', shortName: 'coqui-kumar-en', gender: 'Male', locale: 'en', provider: 'coqui', modelPath: 'Kumar Dahl' },
    { name: 'Eugenio Mataracı', shortName: 'coqui-eugenio-en', gender: 'Male', locale: 'en', provider: 'coqui', modelPath: 'Eugenio Mataracı' },
    { name: 'Ferran Simen', shortName: 'coqui-ferran-en', gender: 'Male', locale: 'en', provider: 'coqui', modelPath: 'Ferran Simen' },
    { name: 'Xavier Hayasaka', shortName: 'coqui-xavier-en', gender: 'Male', locale: 'en', provider: 'coqui', modelPath: 'Xavier Hayasaka' },
    { name: 'Luis Moray', shortName: 'coqui-luis-en', gender: 'Male', locale: 'en', provider: 'coqui', modelPath: 'Luis Moray' },
    { name: 'Marcos Rudaski', shortName: 'coqui-marcos-en', gender: 'Male', locale: 'en', provider: 'coqui', modelPath: 'Marcos Rudaski' }
  ]
}

// ElevenLabs API key storage
let elevenLabsApiKey: string | null = null

export function setElevenLabsApiKey(apiKey: string): void {
  elevenLabsApiKey = apiKey
}

export function getElevenLabsApiKey(): string | null {
  return elevenLabsApiKey
}


// Check if Piper voice model file exists
function isPiperVoiceInstalled(modelPath: string): boolean {
  const resourcesPath = getPiperResourcesPath()
  const fullModelPath = path.join(resourcesPath, 'voices', modelPath)
  return fs.existsSync(fullModelPath)
}

export async function getVoicesForLanguage(language: string, provider?: TTSProvider): Promise<VoiceInfo[]> {
  let allVoices: VoiceInfo[] = []

  if (!provider || provider === 'rhvoice') {
    // Get installed RHVoice voices from SAPI
    const installedRHVoices = await getInstalledRHVoices()
    const rhvoiceVoices = (RHVOICE_VOICES[language] || []).map(voice => ({
      ...voice,
      isInstalled: installedRHVoices.some(v => v.toLowerCase() === voice.shortName.toLowerCase())
    }))
    allVoices = allVoices.concat(rhvoiceVoices)
  }

  if (!provider || provider === 'piper') {
    // Check if each Piper voice model file exists
    const piperVoices = (PIPER_VOICES[language] || []).map(voice => ({
      ...voice,
      isInstalled: voice.modelPath ? isPiperVoiceInstalled(voice.modelPath) : false
    }))
    allVoices = allVoices.concat(piperVoices)
  }

  // Silero requires Python environment to be set up
  if ((!provider || provider === 'silero') && checkSileroInstalled()) {
    allVoices = allVoices.concat(SILERO_VOICES[language] || [])
  }

  if (!provider || provider === 'elevenlabs') {
    allVoices = allVoices.concat(ELEVENLABS_VOICES[language] || [])
  }

  // Coqui XTTS-v2 requires Python environment to be set up
  if ((!provider || provider === 'coqui') && checkCoquiInstalled()) {
    allVoices = allVoices.concat(COQUI_VOICES[language] || [])
  }

  if (allVoices.length === 0) {
    throw new Error(`Language ${language} is not supported`)
  }

  return allVoices
}

export function getSupportedLanguages(): Array<{ code: string; name: string }> {
  return [
    { code: 'ru-RU', name: 'Русский' },
    { code: 'en', name: 'English' }
  ]
}

export function getAvailableProviders(): Array<{ id: TTSProvider; name: string; description: string; requiresSetup?: boolean }> {
  const providers: Array<{ id: TTSProvider; name: string; description: string; requiresSetup?: boolean }> = [
    {
      id: 'rhvoice',
      name: 'RHVoice',
      description: 'Легковесный офлайн-движок на базе Windows SAPI. Минимальный размер установки, мгновенная генерация речи. Отлично подходит для быстрой озвучки больших текстов.',
      requiresSetup: true
    },
    {
      id: 'piper',
      name: 'Piper',
      description: 'Нейросетевой синтез на базе ONNX Runtime. Высокое качество звучания при быстрой генерации речи. Компактные голосовые модели, полностью офлайн работа на CPU.',
      requiresSetup: true
    },
    {
      id: 'silero',
      name: 'Silero',
      description: 'Продвинутый нейросетевой движок на PyTorch. Естественное и выразительное звучание, множество голосов. Работает офлайн, требует больше времени на генерацию.',
      requiresSetup: true
    },
    // temporarily disabled
    // {
    //   id: 'coqui',
    //   name: 'Coqui XTTS-v2',
    //   description: 'Продвинутая мультиязычная модель с 55+ встроенными голосами. Высочайшее качество синтеза, поддержка множества языков. Требует ~4GB места и GPU для ускорения.',
    //   requiresSetup: true
    // },
    {
      id: 'elevenlabs',
      name: 'ElevenLabs',
      description: 'Премиум облачный сервис с передовыми технологиями синтеза. Превосходное качество, возможность клонирования голоса. Требует API-ключ и подключение к интернету.',
      requiresSetup: false
    }
  ]

  return providers
}

export function isProviderAvailableForLanguage(provider: TTSProvider, language: string): boolean {
  switch (provider) {
    case 'rhvoice':
      return RHVOICE_VOICES[language] !== undefined
    case 'piper':
      return PIPER_VOICES[language] !== undefined
    case 'silero':
      return SILERO_VOICES[language] !== undefined
    case 'elevenlabs':
      return ELEVENLABS_VOICES[language] !== undefined
    case 'coqui':
      return COQUI_VOICES[language] !== undefined
    default:
      return false
  }
}

// Get path to resources - uses userData for packaged app (dependencies installed at runtime)
function getResourcesPath(): string {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'tts_resources')
  } else {
    return path.join(process.cwd(), 'tts_resources')
  }
}


function getPiperResourcesPath(): string {
  return path.join(getResourcesPath(), 'piper')
}

// Get path to Piper executable
function getPiperExecutable(): string {
  const resourcesPath = getPiperResourcesPath()
  return path.join(resourcesPath, 'bin', 'piper', 'piper.exe')
}

// Get path to Python executable for Silero
function getSileroPythonExecutable(): string {
  const resourcesPath = getResourcesPath()
  return path.join(resourcesPath, 'silero', 'venv', 'Scripts', 'python.exe')
}

// Get path to Silero script
function getSileroScript(): string {
  const resourcesPath = getResourcesPath()
  return path.join(resourcesPath, 'silero', 'generate.py')
}


// Coqui XTTS-v2 path helpers
function getCoquiPythonExecutable(): string {
  const resourcesPath = getResourcesPath()
  return path.join(resourcesPath, 'coqui', 'venv', 'Scripts', 'python.exe')
}

function getCoquiScript(): string {
  const resourcesPath = getResourcesPath()
  return path.join(resourcesPath, 'coqui', 'generate.py')
}

// Clean text for TTS
function cleanTextForTTS(text: string): string {
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/[""«»]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .trim()
}

// Split text into chunks
function splitIntoChunks(text: string, maxLength: number = 1000): string[] {
  const cleanedText = cleanTextForTTS(text)
  const chunks: string[] = []
  const paragraphs = cleanedText.split(/\n\n+/)
  let currentChunk = ''

  for (const para of paragraphs) {
    const trimmedPara = para.trim()
    if (!trimmedPara) continue

    if ((currentChunk + '\n\n' + trimmedPara).length > maxLength) {
      if (currentChunk) {
        chunks.push(currentChunk.trim())
      }

      if (trimmedPara.length > maxLength) {
        const sentences = trimmedPara.match(/[^.!?]+[.!?]+\s*/g) || [trimmedPara]
        let sentenceChunk = ''

        for (const sentence of sentences) {
          if ((sentenceChunk + sentence).length > maxLength) {
            if (sentenceChunk) {
              chunks.push(sentenceChunk.trim())
            }
            sentenceChunk = sentence
          } else {
            sentenceChunk += sentence
          }
        }

        if (sentenceChunk.trim()) {
          currentChunk = sentenceChunk
        } else {
          currentChunk = ''
        }
      } else {
        currentChunk = trimmedPara
      }
    } else {
      currentChunk = currentChunk ? currentChunk + '\n\n' + trimmedPara : trimmedPara
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim())
  }

  return chunks.filter(c => c.length > 0)
}

// ============= RHVoice (SAPI) Implementation =============
async function generateSpeechWithRHVoice(
  text: string,
  voice: string,
  outputPath: string
): Promise<void> {
  const tempDir = path.dirname(outputPath)
  const timestamp = Date.now()
  const tempTextPath = path.join(tempDir, `temp_text_${timestamp}.txt`)
  const tempScriptPath = path.join(tempDir, `temp_script_${timestamp}.ps1`)

  fs.writeFileSync(tempTextPath, text, { encoding: 'utf8' })

  const psScript = `
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice("${voice}")
$synth.SetOutputToWaveFile("${outputPath.replace(/\\/g, '\\\\')}")
$text = [System.IO.File]::ReadAllText("${tempTextPath.replace(/\\/g, '\\\\')}", [System.Text.Encoding]::UTF8)
$synth.Speak($text)
$synth.Dispose()
`

  fs.writeFileSync(tempScriptPath, psScript, 'utf-8')

  try {
    await execAsync(`powershell.exe -ExecutionPolicy Bypass -File "${tempScriptPath}"`)
  } finally {
    if (fs.existsSync(tempScriptPath)) fs.unlinkSync(tempScriptPath)
    if (fs.existsSync(tempTextPath)) fs.unlinkSync(tempTextPath)
  }
}

// ============= Piper Implementation =============
async function generateSpeechWithPiper(
  text: string,
  modelPath: string,
  outputPath: string,
  options: { rate?: string } = {}
): Promise<void> {
  const resourcesPath = getPiperResourcesPath()
  const fullModelPath = path.join(resourcesPath, 'voices', modelPath)

  if (!fs.existsSync(fullModelPath)) {
    throw new Error(`Piper voice model not found: ${fullModelPath}`)
  }

  const piperExe = getPiperExecutable()
  const piperDir = path.dirname(piperExe)

  let lengthScale = 1.0
  if (options.rate) {
    const match = options.rate.match(/^([+-])(\d+)%$/)
    if (match) {
      const sign = match[1]
      const percent = parseInt(match[2])
      if (sign === '+') {
        lengthScale = 1.0 / (1.0 + percent / 100)
      } else {
        lengthScale = 1.0 / (1.0 - percent / 100)
      }
    }
  }

  return new Promise<void>((resolve, reject) => {
    const args = [
      '--model', fullModelPath,
      '--output_file', outputPath,
      '--length_scale', lengthScale.toFixed(2)
    ]

    // Run piper from its own directory so it can find DLLs
    const piperProcess = spawn(piperExe, args, { cwd: piperDir })
    let stderr = ''

    piperProcess.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    piperProcess.on('error', (error) => {
      reject(new Error(`Failed to start Piper: ${error.message}`))
    })

    piperProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Piper exited with code ${code}: ${stderr}`))
        return
      }

      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
        reject(new Error('Piper failed to generate audio file'))
        return
      }

      resolve()
    })

    if (piperProcess.stdin) {
      piperProcess.stdin.write(text, 'utf8')
      piperProcess.stdin.end()
    } else {
      reject(new Error('Failed to write to Piper stdin'))
    }
  })
}

// ============= Silero Implementation =============
async function generateSpeechWithSilero(
  text: string,
  speakerPath: string,
  outputPath: string
): Promise<void> {
  const pythonExe = getSileroPythonExecutable()
  const sileroScript = getSileroScript()

  if (!fs.existsSync(pythonExe)) {
    throw new Error('Silero Python environment not found. Please run setup script.')
  }

  if (!fs.existsSync(sileroScript)) {
    throw new Error('Silero generation script not found.')
  }

  return new Promise<void>((resolve, reject) => {
    // Extract speaker name from path (e.g., 'v3_1_ru/xenia' -> 'xenia')
    const speaker = speakerPath.includes('/') ? speakerPath.split('/').pop()! : speakerPath

    const args = [
      sileroScript,
      '--text', text,
      '--speaker', speaker,
      '--output', outputPath
    ]

    const sileroProcess = spawn(pythonExe, args)
    let stderr = ''
    let stdout = ''

    sileroProcess.stdout?.on('data', (data) => {
      stdout += data.toString()
    })

    sileroProcess.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    sileroProcess.on('error', (error) => {
      reject(new Error(`Failed to start Silero: ${error.message}`))
    })

    sileroProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Silero exited with code ${code}: ${stderr}`))
        return
      }

      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
        reject(new Error('Silero failed to generate audio file'))
        return
      }

      resolve()
    })
  })
}


async function generateSpeechWithCoqui(
  text: string,
  speakerName: string,
  language: string,
  outputPath: string
): Promise<void> {
  const pythonExe = getCoquiPythonExecutable()
  const coquiScript = getCoquiScript()

  if (!fs.existsSync(pythonExe)) {
    throw new Error('Coqui Python environment not found. Please run setup.')
  }

  if (!fs.existsSync(coquiScript)) {
    throw new Error('Coqui generation script not found.')
  }

  return new Promise<void>((resolve, reject) => {
    const args = [
      coquiScript,
      '--text', text,
      '--speaker', speakerName,
      '--language', language,
      '--output', outputPath
    ]

    const coquiProcess = spawn(pythonExe, args)
    let stderr = ''
    let stdout = ''

    coquiProcess.stdout?.on('data', (data) => {
      stdout += data.toString()
    })

    coquiProcess.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    coquiProcess.on('error', (error) => {
      reject(new Error(`Failed to start Coqui: ${error.message}`))
    })

    coquiProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Coqui exited with code ${code}: ${stderr}`))
        return
      }

      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
        reject(new Error('Coqui failed to generate audio file'))
        return
      }

      resolve()
    })
  })
}

// ============= ElevenLabs Implementation =============
async function generateSpeechWithElevenLabs(
  text: string,
  voiceId: string,
  outputPath: string
): Promise<void> {
  const apiKey = elevenLabsApiKey

  if (!apiKey) {
    throw new Error('ElevenLabs API key not set. Please configure your API key in settings.')
  }

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': apiKey
    },
    body: JSON.stringify({
      text: text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75
      }
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // ElevenLabs returns MP3, but we need WAV for consistency with other providers
  // Save as temp MP3 first, then convert to WAV
  const tempMp3Path = outputPath.replace('.wav', '_temp.mp3')
  fs.writeFileSync(tempMp3Path, buffer)

  // Convert MP3 to WAV using ffmpeg
  const ffmpegExe = getFfmpegExecutable()
  await execAsync(`"${ffmpegExe}" -i "${tempMp3Path}" -acodec pcm_s16le -ar 22050 -ac 1 -y "${outputPath}"`)

  // Clean up temp MP3
  if (fs.existsSync(tempMp3Path)) {
    fs.unlinkSync(tempMp3Path)
  }

  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
    throw new Error('ElevenLabs failed to generate audio file')
  }
}

// ============= Unified Processing =============
async function processChunk(
  chunk: string,
  index: number,
  voiceInfo: VoiceInfo,
  tempDir: string,
  maxRetries: number,
  retryDelay: number,
  options: { rate?: string }
): Promise<{ success: boolean; file?: string; error?: string }> {
  let success = false
  let lastError: Error | null = null
  const tempFile = path.join(tempDir, `chunk_${index}.wav`)

  for (let attempt = 1; attempt <= maxRetries && !success; attempt++) {
    try {
      // Route to appropriate provider
      switch (voiceInfo.provider) {
        case 'rhvoice':
          await generateSpeechWithRHVoice(chunk, voiceInfo.shortName, tempFile)
          break

        case 'piper':
          if (!voiceInfo.modelPath) {
            throw new Error('Model path required for Piper')
          }
          await generateSpeechWithPiper(chunk, voiceInfo.modelPath, tempFile, options)
          break

        case 'silero':
          if (!voiceInfo.modelPath) {
            throw new Error('Speaker path required for Silero')
          }
          await generateSpeechWithSilero(chunk, voiceInfo.modelPath, tempFile)
          break

        case 'elevenlabs':
          if (!voiceInfo.voiceId) {
            throw new Error('Voice ID required for ElevenLabs')
          }
          await generateSpeechWithElevenLabs(chunk, voiceInfo.voiceId, tempFile)
          break

        case 'coqui':
          if (!voiceInfo.modelPath) {
            throw new Error('Speaker name required for Coqui')
          }
          await generateSpeechWithCoqui(chunk, voiceInfo.modelPath, voiceInfo.locale, tempFile)
          break

        default:
          throw new Error(`Unknown provider: ${voiceInfo.provider}`)
      }

      if (fs.existsSync(tempFile) && fs.statSync(tempFile).size > 0) {
        success = true
        return { success: true, file: tempFile }
      } else {
        throw new Error('Audio file was not created or is empty')
      }
    } catch (error) {
      lastError = error as Error
      console.error(`Error processing chunk ${index + 1} (attempt ${attempt}/${maxRetries}):`, error)

      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay))
      }
    }
  }

  return {
    success: false,
    error: lastError?.message || 'Unknown error'
  }
}

export async function convertToSpeech(
  text: string,
  voiceShortName: string,
  outputPath: string,
  options: { rate?: string; volume?: string } = {},
  onProgress?: (progress: number, status: string) => void
): Promise<void> {
  // Find voice by short name across all providers
  let voiceInfo: VoiceInfo | undefined
  const allVoices = [
    ...Object.values(RHVOICE_VOICES).flat(),
    ...Object.values(PIPER_VOICES).flat(),
    ...Object.values(SILERO_VOICES).flat(),
    ...Object.values(ELEVENLABS_VOICES).flat(),
    ...Object.values(COQUI_VOICES).flat()
  ]

  voiceInfo = allVoices.find(v => v.shortName === voiceShortName)

  if (!voiceInfo) {
    throw new Error(`Voice not found: ${voiceShortName}`)
  }

  // Silero and Coqui have token limits in the positional encoder.
  // Cyrillic/non-Latin text expands to more tokens, so use smaller chunks.
  const maxChunkLength = (voiceInfo.provider === 'silero' || voiceInfo.provider === 'coqui') ? 500 : 1000
  const chunks = splitIntoChunks(text, maxChunkLength)

  if (chunks.length === 0) {
    throw new Error('No text content to convert')
  }

  const totalChunks = chunks.length
  const chunksPerPart = 100
  const totalParts = Math.ceil(totalChunks / chunksPerPart)

  const audioFiles: string[] = new Array(totalChunks)
  let successfulChunks = 0
  const errors: Array<{ chunk: number; error: string }> = []
  const maxRetries = 3
  const retryDelay = 1000

  // Concurrency limits depend on provider
  const concurrentLimit = voiceInfo.provider === 'silero' ? 5 :
                         voiceInfo.provider === 'piper' ? 10 :
                         voiceInfo.provider === 'elevenlabs' ? 3 : 30

  onProgress?.(0, `Preparing ${totalChunks} text segments in ${totalParts} parts... (${voiceInfo.provider})`)

  const tempDir = path.join(path.dirname(outputPath), 'temp_audio')
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true })
  }

  let nextChunkIndex = 0
  let completedChunks = 0
  const chunkCompletionTimes: number[] = []

  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000)
    const seconds = totalSeconds % 60
    const minutes = Math.floor(totalSeconds / 60) % 60
    const hours = Math.floor(totalSeconds / 3600)
    const pad = (num: number) => String(num).padStart(2, '0')

    if (hours > 0) {
      return `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`
    } else if (minutes > 0) {
      return `${pad(minutes)}m ${pad(seconds)}s`
    } else {
      return `${pad(seconds)}s`
    }
  }

  const processNextChunk = async () => {
    const currentIndex = nextChunkIndex++
    if (currentIndex >= chunks.length) return

    const chunkStartTime = Date.now()

    try {
      const result = await processChunk(
        chunks[currentIndex],
        currentIndex,
        voiceInfo!,
        tempDir,
        maxRetries,
        retryDelay,
        options
      )

      if (result.success && result.file) {
        audioFiles[currentIndex] = result.file
        successfulChunks++
      } else {
        errors.push({
          chunk: currentIndex + 1,
          error: result.error || 'Unknown error'
        })
      }

      completedChunks++
      const chunkDuration = Date.now() - chunkStartTime
      chunkCompletionTimes.push(chunkDuration)

      let statusMessage = ''
      if (completedChunks >= 3) {
        const recentTimes = chunkCompletionTimes.slice(-10)
        const avgTimePerChunk = recentTimes.reduce((a, b) => a + b, 0) / recentTimes.length
        const remainingChunks = totalChunks - completedChunks
        const estimatedRemainingMs = (remainingChunks * avgTimePerChunk) / concurrentLimit
        statusMessage = `Осталось ~${formatTime(estimatedRemainingMs)} | Сегмент ${completedChunks} из ${totalChunks}`
      } else {
        statusMessage = `Вычисляем время... | Сегмент ${completedChunks} из ${totalChunks}`
      }

      onProgress?.(
        Math.round((completedChunks / totalChunks) * 90),
        statusMessage
      )
    } catch (error) {
      errors.push({
        chunk: currentIndex + 1,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      completedChunks++
    }
  }

  // Process chunks with proper parallelization
  for (let i = 0; i < chunks.length; i += concurrentLimit) {
    const batch = []
    for (let j = 0; j < concurrentLimit && i + j < chunks.length; j++) {
      batch.push(processNextChunk())
    }
    await Promise.all(batch)
  }

  const validAudioFiles = audioFiles.filter(f => f !== undefined)

  if (validAudioFiles.length === 0) {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true })
      }
    } catch (error) {
      console.warn('Failed to clean up temp directory:', error)
    }

    const errorDetails = errors.length > 0
      ? `\n\nDetails:\n${errors.map(e => `- Segment ${e.chunk}: ${e.error}`).join('\n')}`
      : ''
    throw new Error(
      `Failed to generate any audio after ${maxRetries} attempts per segment.${errorDetails}`
    )
  }

  if (successfulChunks < totalChunks) {
    const failedCount = totalChunks - successfulChunks
    console.warn(
      `Warning: ${failedCount} of ${totalChunks} segments failed to convert. ` +
      `Proceeding with ${successfulChunks} successful segments.`
    )
  }

  // Combine files into parts
  const outputDir = path.dirname(outputPath)
  const outputBaseName = path.basename(outputPath, path.extname(outputPath))

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  for (let partIndex = 0; partIndex < totalParts; partIndex++) {
    const startIdx = partIndex * chunksPerPart
    const endIdx = Math.min(startIdx + chunksPerPart, validAudioFiles.length)
    const partFiles = validAudioFiles.slice(startIdx, endIdx)

    if (partFiles.length === 0) continue

    const currentPart = partIndex + 1
    const partProgress = 90 + Math.round((currentPart / totalParts) * 10)
    onProgress?.(
      partProgress,
      `Создание части ${currentPart} из ${totalParts} (сегменты ${startIdx + 1}-${endIdx})...`
    )

    const partOutputPath = totalParts > 1
      ? path.join(outputDir, `${outputBaseName}_part${currentPart}.mp3`)
      : outputPath

    await combineToPart(partFiles, partOutputPath, tempDir)
  }

  // Clean up temp directory
  try {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true })
    }
  } catch (error) {
    console.warn('Failed to clean up temp directory:', error)
  }

  onProgress?.(100, `Conversion complete! Created ${totalParts} part(s).`)
}


/**
 * Preview a voice by generating a short audio sample and returning its path
 */
export async function previewVoice(
  text: string,
  voiceShortName: string
): Promise<{ success: boolean; audioData?: string; error?: string }> {
  // Find voice by short name across all providers
  const allVoices = [
    ...Object.values(RHVOICE_VOICES).flat(),
    ...Object.values(PIPER_VOICES).flat(),
    ...Object.values(SILERO_VOICES).flat(),
    ...Object.values(ELEVENLABS_VOICES).flat(),
    ...Object.values(COQUI_VOICES).flat()
  ]

  const voiceInfo = allVoices.find(v => v.shortName === voiceShortName)

  if (!voiceInfo) {
    return { success: false, error: `Voice not found: ${voiceShortName}` }
  }

  // Use a temp directory for preview files
  const tempDir = path.join(app.getPath('temp'), 'book-to-mp3-preview')
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true })
  }

  const timestamp = Date.now()
  const tempWavFile = path.join(tempDir, `preview_${timestamp}.wav`)
  const tempMp3File = path.join(tempDir, `preview_${timestamp}.mp3`)

  console.log('Preview paths:', { tempDir, tempWavFile, tempMp3File, voice: voiceShortName })

  try {
    // Generate audio based on provider
    switch (voiceInfo.provider) {
      case 'rhvoice':
        await generateSpeechWithRHVoice(text, voiceInfo.shortName, tempWavFile)
        break

      case 'piper':
        if (!voiceInfo.modelPath) {
          return { success: false, error: 'Model path required for Piper' }
        }
        await generateSpeechWithPiper(text, voiceInfo.modelPath, tempWavFile, {})
        break

      case 'silero':
        if (!voiceInfo.modelPath) {
          return { success: false, error: 'Speaker path required for Silero' }
        }
        await generateSpeechWithSilero(text, voiceInfo.modelPath, tempWavFile)
        break

      case 'elevenlabs':
        if (!voiceInfo.voiceId) {
          return { success: false, error: 'Voice ID required for ElevenLabs' }
        }
        await generateSpeechWithElevenLabs(text, voiceInfo.voiceId, tempWavFile)
        break

      case 'coqui':
        if (!voiceInfo.modelPath) {
          return { success: false, error: 'Speaker name required for Coqui' }
        }
        await generateSpeechWithCoqui(text, voiceInfo.modelPath, voiceInfo.locale, tempWavFile)
        break

      default:
        return { success: false, error: `Unknown provider: ${voiceInfo.provider}` }
    }

    console.log('WAV exists:', fs.existsSync(tempWavFile), 'Size:', fs.existsSync(tempWavFile) ? fs.statSync(tempWavFile).size : 0)

    if (!fs.existsSync(tempWavFile) || fs.statSync(tempWavFile).size === 0) {
      return { success: false, error: 'Audio file was not created or is empty' }
    }

    // Convert WAV to MP3 for browser playback
    await convertWavToMp3(tempWavFile, tempMp3File)

    console.log('MP3 exists:', fs.existsSync(tempMp3File), 'Size:', fs.existsSync(tempMp3File) ? fs.statSync(tempMp3File).size : 0)

    // Clean up WAV file
    try {
      fs.unlinkSync(tempWavFile)
    } catch {
      // Ignore cleanup errors
    }

    if (!fs.existsSync(tempMp3File) || fs.statSync(tempMp3File).size === 0) {
      return { success: false, error: 'Failed to convert audio to MP3' }
    }

    // Read MP3 file as base64
    const audioBuffer = fs.readFileSync(tempMp3File)
    const audioBase64 = audioBuffer.toString('base64')
    const audioData = `data:audio/mpeg;base64,${audioBase64}`

    console.log('Audio data length:', audioData.length)

    // Clean up MP3 file
    try {
      fs.unlinkSync(tempMp3File)
    } catch {
      // Ignore cleanup errors
    }

    return { success: true, audioData }
  } catch (error) {
    console.error('Preview error:', error)
    // Clean up temp files on error
    try {
      if (fs.existsSync(tempWavFile)) fs.unlinkSync(tempWavFile)
      if (fs.existsSync(tempMp3File)) fs.unlinkSync(tempMp3File)
    } catch {
      // Ignore cleanup errors
    }
    return { success: false, error: (error as Error).message }
  }
}

// Combine multiple WAV files
async function combineWavFiles(inputFiles: string[], outputPath: string): Promise<void> {
  if (inputFiles.length === 0) {
    throw new Error('No input files to combine')
  }

  const firstFile = inputFiles[0]
  const headerBuffer = Buffer.alloc(44)
  const fd = fs.openSync(firstFile, 'r')
  fs.readSync(fd, headerBuffer, 0, 44, 0)
  fs.closeSync(fd)

  let totalDataSize = 0
  for (const file of inputFiles) {
    const stats = fs.statSync(file)
    totalDataSize += stats.size - 44
  }

  const newFileSize = 36 + totalDataSize
  headerBuffer.writeUInt32LE(newFileSize, 4)
  headerBuffer.writeUInt32LE(totalDataSize, 40)

  const writeStream = fs.createWriteStream(outputPath, { highWaterMark: 64 * 1024 })
  writeStream.write(headerBuffer)

  for (const file of inputFiles) {
    await new Promise<void>((resolve, reject) => {
      const readStream = fs.createReadStream(file, {
        start: 44,
        highWaterMark: 64 * 1024
      })

      readStream.on('data', (chunk) => {
        if (!writeStream.write(chunk)) {
          readStream.pause()
          writeStream.once('drain', () => readStream.resume())
        }
      })

      readStream.on('end', resolve)
      readStream.on('error', reject)
    })
  }

  await new Promise<void>((resolve, reject) => {
    writeStream.end(() => resolve())
    writeStream.on('error', reject)
  })
}

// Combine a group of WAV files and convert to MP3
async function combineToPart(
  inputFiles: string[],
  outputMp3Path: string,
  tempDir: string
): Promise<void> {
  if (inputFiles.length === 0) {
    throw new Error('No input files to combine')
  }

  const tempWavPath = path.join(tempDir, `part_${Date.now()}.wav`)

  try {
    if (inputFiles.length === 1) {
      fs.copyFileSync(inputFiles[0], tempWavPath)
    } else {
      await combineWavFiles(inputFiles, tempWavPath)
    }

    await convertWavToMp3(tempWavPath, outputMp3Path)

    if (fs.existsSync(tempWavPath)) {
      fs.unlinkSync(tempWavPath)
    }
  } catch (error) {
    if (fs.existsSync(tempWavPath)) {
      fs.unlinkSync(tempWavPath)
    }
    throw error
  }
}

// Get path to ffmpeg executable
function getFfmpegExecutable(): string {
  const resourcesPath = getResourcesPath()
  return path.join(resourcesPath, 'ffmpeg', 'ffmpeg.exe')
}

// Convert WAV to MP3 using FFmpeg
async function convertWavToMp3(wavPath: string, mp3Path: string): Promise<void> {
  const ffmpegExe = getFfmpegExecutable()

  if (!fs.existsSync(ffmpegExe)) {
    throw new Error(
      'FFmpeg not found. Please run setup script to download FFmpeg.'
    )
  }

  const ffmpegCommand = `"${ffmpegExe}" -i "${wavPath}" -b:a 128k -ar 22050 -ac 1 -y "${mp3Path}"`

  try {
    await execAsync(ffmpegCommand, { maxBuffer: 1024 * 1024 * 100 })
  } catch (error) {
    throw new Error(`Failed to convert WAV to MP3: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }

  if (!fs.existsSync(mp3Path) || fs.statSync(mp3Path).size === 0) {
    throw new Error('MP3 file was not created or is empty')
  }
}
