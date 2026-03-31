import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function AppFooter() {
  return (
    <View style={styles.footer}>
      <Text style={styles.footerText}>Version 7.0.0</Text>
      <Text style={styles.footerText}>Copyright © JM MAGIC SHOP</Text>
      <Text style={styles.footerText}>Bhavik Shah | Made with ❤️ in India</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: { paddingVertical: 16, paddingTop: 20, paddingBottom: 20, alignItems: 'center' },
  footerText: { color: '#9ca3af', fontSize: 12, marginVertical: 4, textAlign: 'center' },
});
