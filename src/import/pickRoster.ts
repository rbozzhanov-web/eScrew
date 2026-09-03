import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';
import { parseAimsCrewScheduleHtml } from '@/src/aims/localCrewScheduleHtml';
import { parseAirAstanaRoster, type ParsedAirAstanaRoster } from './parseAirAstanaRoster';
import { extractPdfPagesWeb } from './pdfWeb';

export async function pickAndParseRoster():Promise<ParsedAirAstanaRoster|undefined>{
  const result=await DocumentPicker.getDocumentAsync({type:'*/*',multiple:false,copyToCacheDirectory:true});
  if(result.canceled||!result.assets[0])return undefined;
  if(Platform.OS!=='web')throw new Error('Use the web/PWA build for roster file import.');
  const asset=result.assets[0];
  const data=asset.file?await asset.file.arrayBuffer():await(await fetch(asset.uri)).arrayBuffer();
  const header=new TextDecoder('ascii').decode(data.slice(0,5));
  if(header==='%PDF-')return parseAirAstanaRoster(await extractPdfPagesWeb(data));
  const text=new TextDecoder('utf-8').decode(data);
  if(/CrewSchedule|initialResult|\/eCrew\/CrewSchedule/i.test(text))return parseAimsCrewScheduleHtml(text);
  throw new Error('Unsupported roster file. Choose an Air Astana roster PDF or a saved AIMS Crew Schedule HTML file.');
}
