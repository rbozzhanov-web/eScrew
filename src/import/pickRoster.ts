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

export async function parseRosterData(data:ArrayBuffer,name=''):Promise<ParsedAirAstanaRoster>{
  const header=new TextDecoder('ascii').decode(data.slice(0,8));
  if(header.startsWith('%PDF-'))return parseAirAstanaRoster(await extractPdfPagesWeb(data));

  const text=decodeSavedAimsPage(data);
  if(/CrewSchedule|initialResult|\/eCrew\/CrewSchedule/i.test(text))return parseAimsCrewScheduleHtml(text);

  const isWebArchive=header.startsWith('bplist00')||/\.webarchive$/i.test(name);
  throw new Error(isWebArchive
    ? 'This Safari Web Archive does not contain a loaded AIMS Crew Schedule. Open Crew Schedule in AIMS, wait until it finishes loading, then copy it again as Web Archive.'
    : 'Unsupported roster file. On iPhone: AIMS Crew Schedule → Share → Options → Web Archive → Copy. Then return to eScrew and paste it into AIMS.');
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
