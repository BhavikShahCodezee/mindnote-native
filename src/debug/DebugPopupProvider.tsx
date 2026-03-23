import React, { useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { setDebugLogger } from './logDebug';

const MAX_MESSAGES = 80;

export function DebugPopupProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);

  useEffect(() => {
    setDebugLogger((message: string) => {
      setMessages((prev) => {
        const next = [...prev, message];
        return next.length > MAX_MESSAGES ? next.slice(next.length - MAX_MESSAGES) : next;
      });
      setVisible(true);
    });
    return () => setDebugLogger(null);
  }, []);

  const title = useMemo(() => `Debug (${messages.length})`, [messages.length]);

  return (
    <>
      {children}
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>{title}</Text>
              <TouchableOpacity onPress={() => setVisible(false)} style={styles.closeBtn} accessibilityRole="button">
                <Text style={styles.closeText}>OK</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.body}>
              {messages.map((m, i) => (
                <Text key={`${i}-${m.slice(0, 8)}`} style={styles.msg}>
                  {m}
                </Text>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    maxHeight: '70%',
  },
  header: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f6f8fc',
  },
  headerTitle: { fontWeight: '800', color: '#111827' },
  closeBtn: {
    backgroundColor: '#0a7ea4',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  closeText: { color: '#fff', fontWeight: '800' },
  body: { paddingHorizontal: 12, paddingVertical: 10 },
  msg: { color: '#111827', fontSize: 12, marginBottom: 6 },
});

