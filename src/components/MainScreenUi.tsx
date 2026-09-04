import { StyleSheet, View } from 'react-native';
import MainScreenEntry from './MainScreenEntry';

export default function MainScreenUi() {
  return <View style={styles.root}>
    <MainScreenEntry />
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
