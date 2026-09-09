import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';
import { parseAimsCrewScheduleHtml } from '@/src/aims/localCrewScheduleHtml';
import { parseAirAstanaRoster, type ParsedAirAstanaRoster } from './parseAirAstanaRoster';
import { extractPdfPagesWeb } from './pdfWeb';

export async function pickAndParseRoster():Promise<ParsedAirAstanaRoster|undefined>{
  const result=await DocumentPicker.getDocumentAsync({type:'*/*',multiple:false,copyToCacheDirectory:true});
  if(result.canceled||!result.assets[0])return undefined;
  if(Platform.OS!=='web')throw new Error('Use the eScrew web/PWA build for local roster-file import.');
  const asset=result.assets[0];
  const data=asset.file?await asset.file.arrayBuffer():await(await fetch(asset.uri)).arrayBuffer();
  return parseRosterData(data,asset.name??'');
}

const SHORTCUT_PASTE_PREFIX='ESCREW-WEBARCHIVE-v1:';

/**
 * Companion to pickAndParseRoster for the "Paste Web Archive from Shortcut" flow
 * (see SHORTCUT_IMPORT.md): a one-time iOS Shortcut base64-encodes a saved AIMS
 * Web Archive from Safari's own Share Sheet and puts it on the device-only
 * clipboard behind a magic prefix, so a roster can be imported without ever
 * saving a file to Files. Feeds the same parseRosterData the file picker uses,
 * so parsing behavior — and every format it accepts — is identical either way.
 */
export async function pasteRosterFromClipboard():Promise<ParsedAirAstanaRoster>{
  if(Platform.OS!=='web'||typeof navigator==='undefined'||!navigator.clipboard?.readText)
    throw new Error('Paste from Shortcut is available in the web app.');
  let text:string;
  try{text=await navigator.clipboard.readText()}
  catch{throw new Error('Could not read the clipboard. Allow paste when iOS asks, then try again.')}
  if(!text.startsWith(SHORTCUT_PASTE_PREFIX))
    throw new Error('Clipboard does not contain a Web Archive from the Shortcut. Run the Shortcut on a saved AIMS page first.');
  let data:ArrayBuffer;
  try{data=base64ToArrayBuffer(text.slice(SHORTCUT_PASTE_PREFIX.length).trim())}
  catch{throw new Error('The pasted Web Archive is corrupted. Run the Shortcut again and retry.')}
  const roster=await parseRosterData(data,'shortcut.webarchive');
  try{await navigator.clipboard.writeText('')}catch{/* best-effort only, not worth failing the import over */}
  return roster;
}

function base64ToArrayBuffer(base64:string):ArrayBuffer{
  const binary=atob(base64);
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return bytes.buffer;
}

export async function parseRosterData(data:ArrayBuffer,name=''):Promise<ParsedAirAstanaRoster>{
  const header=new TextDecoder('ascii').decode(data.slice(0,8));
  if(header.startsWith('%PDF-'))return parseAirAstanaRoster(await extractPdfPagesWeb(data));

  const text=decodeSavedAimsPage(data);
  if(/CrewSchedule|initialResult|\/eCrew\/CrewSchedule/i.test(text))return parseAimsCrewScheduleHtml(text);

  const isWebArchive=header.startsWith('bplist00')||/\.webarchive$/i.test(name);
  throw new Error(isWebArchive
    ? 'This Safari Web Archive does not contain a loaded AIMS Crew Schedule. Open Crew Schedule in AIMS, wait until it finishes loading, then save it again as Web Archive.'
    : 'Unsupported roster file. On iPhone: AIMS Crew Schedule → Share → Options → Web Archive → Save to Files. Then return to eScrew → AIMS → Import Web Archive.');
}

/**
 * iPhone Safari saves Web Archive files as a binary property list. The main HTML
 * resource is embedded as raw bytes, so no plist execution/parsing is needed:
 * decoding the local file exposes the same inert HTML source consumed by the
 * CrewSchedule parser. Detect the page charset first so names/addresses survive.
 */
function decodeSavedAimsPage(data:ArrayBuffer):string{
  const bytes=new Uint8Array(data);
  const probeBytes=bytes.subarray(0,Math.min(bytes.length,256*1024));
  const probe=new TextDecoder('windows-1252').decode(probeBytes);
  const declared=/charset\s*=\s*["']?\s*([a-z0-9._-]+)/i.exec(probe)?.[1]?.toLowerCase();
  const encoding=declared==='windows-1251'||declared==='cp1251'?'windows-1251':declared==='windows-1252'||declared==='iso-8859-1'?'windows-1252':'utf-8';
  try{return new TextDecoder(encoding).decode(bytes)}catch{return new TextDecoder('utf-8').decode(bytes)}
}
