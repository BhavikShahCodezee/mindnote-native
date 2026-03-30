import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { NoteItem, deleteNote, loadNotes } from '@/src/storage/notes';

function notePreview(text: string): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (clean.length <= 120) return clean;
  return `${clean.slice(0, 120)}…`;
}

export default function NotesScreen() {
  const router = useRouter();
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNotes = useCallback(async () => {
    setRefreshing(true);
    const list = await loadNotes();
    setNotes(list);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes, router]);

  useFocusEffect(
    useCallback(() => {
      fetchNotes();
    }, [fetchNotes])
  );

  const onDelete = useCallback((note: NoteItem) => {
    Alert.alert('Delete note', 'Remove this note?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const next = await deleteNote(note.id);
          setNotes(next);
        },
      },
    ]);
  }, []);

  const { leftColumn, rightColumn } = useMemo(() => {
    const left: NoteItem[] = [];
    const right: NoteItem[] = [];
    notes.forEach((n, i) => (i % 2 === 0 ? left : right).push(n));
    return { leftColumn: left, rightColumn: right };
  }, [notes]);

  const renderNoteCard = (note: NoteItem) => (
    <View key={note.id} style={styles.noteCard}>
      <TouchableOpacity
        style={styles.deleteIcon}
        onPress={() => onDelete(note)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityLabel="Delete note"
      >
        <MaterialIcons name="delete-outline" size={18} color={COLORS.textMuted} />
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.noteTouchable}
        onPress={() => router.push({ pathname: '/note-editor' as never, params: { id: note.id } })}
        activeOpacity={0.7}
      >
        <Text style={styles.noteText}>{notePreview(note.content)}</Text>
        <Text style={styles.noteDate}>
          {new Date(note.updatedAt).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.root}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.iconBtn} accessibilityLabel="Menu (coming soon)" disabled>
            <MaterialIcons name="menu" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <View style={styles.searchPill}>
            <MaterialIcons name="search" size={20} color={COLORS.textMuted} />
            <Text style={styles.searchPlaceholder}>Search your notes</Text>
          </View>
          <TouchableOpacity style={styles.iconBtn} accessibilityLabel="View (coming soon)" disabled>
            <MaterialIcons name="view-module" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <View style={styles.avatar}>
            <MaterialIcons name="person" size={20} color={COLORS.textMuted} />
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={fetchNotes}
              tintColor={COLORS.textMuted}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {notes.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>No notes yet</Text>
              <Text style={styles.emptyBody}>Tap + to create a note</Text>
            </View>
          ) : (
            <View style={styles.masonry}>
              <View style={styles.column}>{leftColumn.map(renderNoteCard)}</View>
              <View style={styles.column}>{rightColumn.map(renderNoteCard)}</View>
            </View>
          )}
        </ScrollView>

        <TouchableOpacity
          style={styles.fab}
          onPress={() => router.push('/note-editor' as never)}
          activeOpacity={0.85}
          accessibilityLabel="Add note"
        >
          <MaterialIcons name="add" size={32} color="#202124" />
        </TouchableOpacity>

        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.bottomIcon} disabled accessibilityLabel="Checklist (coming soon)">
            <MaterialIcons name="check-box-outline-blank" size={24} color={COLORS.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.bottomIcon} disabled accessibilityLabel="Drawing (coming soon)">
            <MaterialIcons name="brush" size={24} color={COLORS.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.bottomIcon} disabled accessibilityLabel="Voice (coming soon)">
            <MaterialIcons name="mic-none" size={26} color={COLORS.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.bottomIcon} disabled accessibilityLabel="Image (coming soon)">
            <MaterialIcons name="image" size={24} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const COLORS = {
  bg: '#202124',
  border: '#5f6368',
  text: '#e8eaed',
  textMuted: '#9aa0a6',
  searchBg: '#303134',
  fabBg: '#fdd663',
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  root: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
    gap: 6,
  },
  iconBtn: { padding: 8 },
  searchPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.searchBg,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  searchPlaceholder: {
    color: COLORS.textMuted,
    fontSize: 16,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.searchBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingBottom: 100,
  },
  masonry: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  column: {
    flex: 1,
    gap: 10,
  },
  noteCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: 'transparent',
    position: 'relative',
    overflow: 'hidden',
  },
  deleteIcon: {
    position: 'absolute',
    top: 6,
    right: 6,
    zIndex: 2,
    padding: 4,
  },
  noteTouchable: {
    padding: 12,
    paddingTop: 32,
    paddingRight: 36,
  },
  noteText: {
    color: COLORS.text,
    fontSize: 14,
    lineHeight: 20,
  },
  noteDate: {
    marginTop: 10,
    color: COLORS.textMuted,
    fontSize: 11,
  },
  emptyWrap: {
    paddingVertical: 48,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: { color: COLORS.text, fontSize: 17, fontWeight: '600' },
  emptyBody: { color: COLORS.textMuted, fontSize: 14 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 88,
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: COLORS.fabBg,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 14,
    paddingBottom: 22,
    gap: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#3c4043',
    backgroundColor: COLORS.bg,
  },
  bottomIcon: { opacity: 0.85 },
});
