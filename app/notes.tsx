import { NoteItem, deleteNote, loadNotes } from '@/src/storage/notes';
import { PrinterDeviceType, loadPrinterDeviceType, savePrinterDeviceType } from '@/src/storage/printerDeviceType';
import { usePrinterStore } from '@/src/store/usePrinterStore';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function notePreview(text: string): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (clean.length <= 120) return clean;
  return `${clean.slice(0, 120)}…`;
}

const DARK = {
  bg: '#202124',
  border: '#5f6368',
  text: '#e8eaed',
  textMuted: '#9aa0a6',
  searchBg: '#303134',
  fabBg: '#fdd663',
  fabIcon: '#202124',
  bottomBorder: '#3c4043',
  drawerBg: '#2d2e31',
  drawerActive: '#1a3d5c',
  drawerActiveText: '#8ab4f8',
  drawerIcon: '#9aa0a6',
};

const LIGHT = {
  bg: '#ffffff',
  border: '#dadce0',
  text: '#202124',
  textMuted: '#5f6368',
  searchBg: '#f1f3f4',
  fabBg: '#fdd663',
  fabIcon: '#202124',
  bottomBorder: '#dadce0',
  drawerBg: '#ffffff',
  drawerActive: '#e8f0fe',
  drawerActiveText: '#1a73e8',
  drawerIcon: '#5f6368',
};

const DRAWER_WIDTH = 280;

function makeStyles(dark: boolean) {
  const C = dark ? DARK : LIGHT;
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
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
      backgroundColor: C.searchBg,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 10,
    },
    searchPlaceholder: { color: C.textMuted, fontSize: 16 },
    avatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: C.searchBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scrollContent: { paddingHorizontal: 12, paddingBottom: 100 },
    masonry: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    column: { flex: 1, gap: 10 },
    noteCard: {
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 12,
      backgroundColor: 'transparent',
      position: 'relative',
      overflow: 'hidden',
    },
    deleteIcon: { position: 'absolute', top: 6, right: 6, zIndex: 2, padding: 4 },
    noteTouchable: { padding: 12, paddingTop: 32, paddingRight: 36 },
    noteText: { color: C.text, fontSize: 14, lineHeight: 20 },
    noteDate: { marginTop: 10, color: C.textMuted, fontSize: 11 },
    emptyWrap: { paddingVertical: 48, alignItems: 'center', gap: 8 },
    emptyTitle: { color: C.text, fontSize: 17, fontWeight: '600' },
    emptyBody: { color: C.textMuted, fontSize: 14 },
    fab: {
      position: 'absolute',
      right: 20,
      bottom: 88,
      width: 56,
      height: 56,
      borderRadius: 16,
      backgroundColor: C.fabBg,
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
      borderTopColor: C.bottomBorder,
      backgroundColor: C.bg,
    },
    bottomIcon: { opacity: 0.85 },
    // ── Drawer ──
    drawerModal: { flex: 1, flexDirection: 'row' },
    drawerBackdrop: {
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    drawerPanel: {
      width: DRAWER_WIDTH,
      height: '100%',
      backgroundColor: C.drawerBg,
      elevation: 24,
      shadowColor: '#000',
      shadowOpacity: 0.4,
      shadowRadius: 12,
      shadowOffset: { width: 4, height: 0 },
    },
    drawerHeader: {
      paddingHorizontal: 20,
      paddingTop: 52,
      paddingBottom: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: dark ? '#3c4043' : '#dadce0',
    },
    drawerAppName: {
      fontSize: 22,
      fontWeight: '700',
      color: C.text,
      letterSpacing: 0.2,
    },
    drawerItem: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 8,
      marginVertical: 2,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 28,
      gap: 14,
    },
    drawerItemActive: {
      backgroundColor: C.drawerActive,
    },
    drawerItemLabel: {
      fontSize: 15,
      fontWeight: '500',
      color: C.text,
    },
    drawerItemLabelActive: {
      color: C.drawerActiveText,
      fontWeight: '700',
    },
    drawerDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: dark ? '#3c4043' : '#dadce0',
      marginHorizontal: 16,
      marginVertical: 6,
    },
    secretBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    secretCard: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: C.border,
      backgroundColor: C.drawerBg,
      padding: 16,
      gap: 12,
    },
    secretTitle: {
      color: C.text,
      fontSize: 16,
      fontWeight: '700',
    },
    secretSub: {
      color: C.textMuted,
      fontSize: 13,
      lineHeight: 18,
    },
    typeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 10,
    },
    typeLabelWrap: { flex: 1, gap: 2 },
    typeTitle: { color: C.text, fontSize: 14, fontWeight: '600' },
    typeBody: { color: C.textMuted, fontSize: 12 },
    secretDoneBtn: {
      marginTop: 6,
      alignSelf: 'flex-end',
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 9,
      backgroundColor: C.drawerActive,
    },
    secretDoneText: { color: C.drawerActiveText, fontWeight: '700' },
  });
}

export default function NotesScreen() {
  const router = useRouter();
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const isConnected = usePrinterStore((s) => s.isConnected);
  const isDarkMode = usePrinterStore((s) => s.isDarkMode);
  const toggleDarkMode = usePrinterStore((s) => s.toggleDarkMode);

  const C = isDarkMode ? DARK : LIGHT;
  const styles = useMemo(() => makeStyles(isDarkMode), [isDarkMode]);

  // ── Drawer animation ──
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [deviceType, setDeviceType] = useState<PrinterDeviceType>('A');
  const drawerAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  const openDrawer = useCallback(() => {
    setDrawerVisible(true);
    Animated.parallel([
      Animated.timing(drawerAnim, { toValue: 0, duration: 240, useNativeDriver: true }),
      Animated.timing(backdropAnim, { toValue: 1, duration: 240, useNativeDriver: true }),
    ]).start();
  }, [backdropAnim, drawerAnim]);

  const closeDrawer = useCallback((then?: () => void) => {
    Animated.parallel([
      Animated.timing(drawerAnim, { toValue: -DRAWER_WIDTH, duration: 200, useNativeDriver: true }),
      Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      setDrawerVisible(false);
      then?.();
    });
  }, [backdropAnim, drawerAnim]);

  const navigateTo = useCallback((path: string) => {
    closeDrawer(() => router.push(path as never));
  }, [closeDrawer, router]);

  // ── Notes loading ──
  const fetchNotes = useCallback(async () => {
    setRefreshing(true);
    const list = await loadNotes();
    setNotes(list);
    setRefreshing(false);
  }, []);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);
  useEffect(() => {
    (async () => {
      const type = await loadPrinterDeviceType();
      setDeviceType(type);
    })();
  }, []);

  useFocusEffect(useCallback(() => { fetchNotes(); }, [fetchNotes]));
  const chooseDeviceType = useCallback(async (type: PrinterDeviceType) => {
    setDeviceType(type);
    await savePrinterDeviceType(type);
  }, []);


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
        <MaterialIcons name="delete-outline" size={18} color={C.textMuted} />
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.noteTouchable}
        onPress={() => router.push({ pathname: '/note-editor' as never, params: { id: note.id } })}
        activeOpacity={0.7}
      >
        <Text style={styles.noteText}>{notePreview(note.content)}</Text>
        <Text style={styles.noteDate}>
          {new Date(note.updatedAt).toLocaleString(undefined, {
            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
          })}
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.root}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={openDrawer}
            accessibilityLabel="Open menu"
          >
            <MaterialIcons name="menu" size={24} color={C.text} />
          </TouchableOpacity>

          <View style={styles.searchPill}>
            <MaterialIcons name="search" size={20} color={C.textMuted} />
            <Text style={styles.searchPlaceholder}>Search your notes</Text>
          </View>

          <TouchableOpacity
            style={styles.iconBtn}
            onPress={toggleDarkMode}
            accessibilityLabel={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <MaterialIcons name={isDarkMode ? 'wb-sunny' : 'dark-mode'} size={22} color={C.text} />
          </TouchableOpacity>

          <View style={styles.avatar}>
            <MaterialIcons
              name={isConnected ? 'person' : 'no-accounts'}
              size={20}
              color={C.textMuted}
            />
          </View>
        </View>

        {/* Notes list */}
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={fetchNotes} tintColor={C.textMuted} />
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
          <MaterialIcons name="add" size={32} color={C.fabIcon} />
        </TouchableOpacity>

        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.bottomIcon} disabled accessibilityLabel="Checklist (coming soon)">
            <MaterialIcons name="check-box-outline-blank" size={24} color={C.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.bottomIcon} disabled accessibilityLabel="Drawing (coming soon)">
            <MaterialIcons name="brush" size={24} color={C.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.bottomIcon} disabled accessibilityLabel="Voice (coming soon)">
            <MaterialIcons name="mic-none" size={26} color={C.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.bottomIcon} disabled accessibilityLabel="Image (coming soon)">
            <MaterialIcons name="image" size={24} color={C.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Google Keep-style drawer ── */}
      <Modal
        visible={drawerVisible}
        transparent
        animationType="none"
        onRequestClose={() => closeDrawer()}
        statusBarTranslucent
      >
        <View style={styles.drawerModal}>
          {/* Backdrop tap to close */}
          <TouchableWithoutFeedback onPress={() => closeDrawer()}>
            <Animated.View style={[styles.drawerBackdrop, { opacity: backdropAnim }]} />
          </TouchableWithoutFeedback>

          {/* Slide-in panel */}
          <Animated.View style={[styles.drawerPanel, { transform: [{ translateX: drawerAnim }] }]}>
            <View style={styles.drawerHeader}>
              <Text style={styles.drawerAppName}> Notes</Text>
            </View>

            {/* Notes — active item */}
            <TouchableOpacity
              style={[styles.drawerItem, styles.drawerItemActive]}
              onPress={() => closeDrawer()}
            >
              <MaterialIcons name="lightbulb-outline" size={22} color={C.drawerActiveText} />
              <Text style={[styles.drawerItemLabel, styles.drawerItemLabelActive]}>Notes</Text>
            </TouchableOpacity>

            {/* Reminders — fake UI item */}
            <TouchableOpacity
              style={styles.drawerItem}
              onPress={() => closeDrawer()}
              onLongPress={() => setShowSecret(true)}
              delayLongPress={450}
            >
              <MaterialIcons name="notifications-none" size={22} color={C.drawerIcon} />
              <Text style={styles.drawerItemLabel}>Reminders</Text>
            </TouchableOpacity>

            <View style={styles.drawerDivider} />

            {/* Create new label — opens Label Driver setup */}
            <TouchableOpacity style={styles.drawerItem} onPress={() => navigateTo('/driver')}>
              <MaterialIcons name="add" size={22} color={C.drawerIcon} />
              <Text style={styles.drawerItemLabel}>Create new label</Text>
            </TouchableOpacity>

            <View style={styles.drawerDivider} />

            {/* Archive — fake UI item */}
            <TouchableOpacity style={styles.drawerItem} onPress={() => closeDrawer()}>
              <MaterialIcons name="archive" size={22} color={C.drawerIcon} />
              <Text style={styles.drawerItemLabel}>Archive</Text>
            </TouchableOpacity>

            {/* Deleted — fake UI item */}
            <TouchableOpacity style={styles.drawerItem} onPress={() => closeDrawer()}>
              <MaterialIcons name="delete-outline" size={22} color={C.drawerIcon} />
              <Text style={styles.drawerItemLabel}>Deleted</Text>
            </TouchableOpacity>

            <View style={styles.drawerDivider} />

            {/* Settings — opens real settings page */}
            <TouchableOpacity
              style={styles.drawerItem}
              onPress={() => navigateTo('/settings')}
            >
              <MaterialIcons name="settings" size={22} color={C.drawerIcon} />
              <Text style={styles.drawerItemLabel}>Settings</Text>
            </TouchableOpacity>

            {/* Help & Feedback — opens connection/printer page */}
            <TouchableOpacity
              style={styles.drawerItem}
              onPress={() => navigateTo('/printer')}
            >
              <MaterialIcons name="help-outline" size={22} color={C.drawerIcon} />
              <Text style={styles.drawerItemLabel}>Help & feedback</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
      <Modal
        visible={showSecret}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSecret(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowSecret(false)}>
          <View style={styles.secretBackdrop}>
            <TouchableWithoutFeedback>
              <View style={styles.secretCard}>
                <Text style={styles.secretTitle}>Printer Device Type</Text>
                <Text style={styles.secretSub}>
                  Type A keeps current flow. Type B uses the alternate BLE printer protocol.
                </Text>

                <TouchableOpacity style={styles.typeRow} onPress={() => chooseDeviceType('A')}>
                  <View style={styles.typeLabelWrap}>
                    <Text style={styles.typeTitle}>Device Type A</Text>
                  </View>
                  <MaterialIcons
                    name={deviceType === 'A' ? 'radio-button-checked' : 'radio-button-unchecked'}
                    size={21}
                    color={deviceType === 'A' ? C.drawerActiveText : C.textMuted}
                  />
                </TouchableOpacity>

                <TouchableOpacity style={styles.typeRow} onPress={() => chooseDeviceType('B')}>
                  <View style={styles.typeLabelWrap}>
                    <Text style={styles.typeTitle}>Device Type B</Text>
                  </View>
                  <MaterialIcons
                    name={deviceType === 'B' ? 'radio-button-checked' : 'radio-button-unchecked'}
                    size={21}
                    color={deviceType === 'B' ? C.drawerActiveText : C.textMuted}
                  />
                </TouchableOpacity>

                <TouchableOpacity style={styles.typeRow} onPress={() => chooseDeviceType('C')}>
                  <View style={styles.typeLabelWrap}>
                    <Text style={styles.typeTitle}>Device Type C</Text>
                  </View>
                  <MaterialIcons
                    name={deviceType === 'C' ? 'radio-button-checked' : 'radio-button-unchecked'}
                    size={21}
                    color={deviceType === 'C' ? C.drawerActiveText : C.textMuted}
                  />
                </TouchableOpacity>

                <TouchableOpacity style={styles.secretDoneBtn} onPress={() => setShowSecret(false)}>
                  <Text style={styles.secretDoneText}>Done</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
}
