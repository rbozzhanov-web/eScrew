import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';
import { parseAirAstanaRoster, type ParsedAirAstanaRoster } from './parseAirAstanaRoster';
import { extractPdfPagesWeb } from './pdfWeb';

export async function pickAndParseRoster():Promise<ParsedAirAstanaRoster|undefined>{
  const result=await DocumentPicker.getDocumentAsync({type:'application/pdf',multiple:false,copyToCacheDirectory:true});
  if(result.canceled||!result.assets[0])return undefined;
  if(Platform.OS!=='web')throw new Error('Use the web/PWA build for roster PDF import.');
  const asset=result.assets[0]; const data=asset.file?await asset.file.arrayBuffer():await(await fetch(asset.uri)).arrayBuffer();
  return parseAirAstanaRoster(await extractPdfPagesWeb(data));
}
