import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import ScreenBackground from '../components/ScreenBackground';

interface Contact {
  id: number;
  name: string;
  phone: string;
  relation: string;
  initials: string;
  color: string;
  primary?: boolean;
}

const COLORS = ['#C9A84C', '#4ade80', '#60a5fa', '#a78bfa', '#f472b6'];

export default function ContactsScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  // Contacts are stored separately for each signed-in user.
  // Native uses AsyncStorage; web uses localStorage.
  const [storageKey, setStorageKey] = useState('wsapp_emergency_contacts_guest');
  const [showForm, setShowForm] = useState(false);
  const [newName,  setNewName]  = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRel,   setNewRel]   = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);

  const getWebStorage = () => {
    try {
      return typeof globalThis !== 'undefined' ? (globalThis as any).localStorage : null;
    } catch { return null; }
  };

  const readUser = async () => {
    try {
      if (Platform.OS === 'web') {
        const raw = getWebStorage()?.getItem?.('wsUser');
        return raw ? JSON.parse(raw) : null;
      }
      const raw = await AsyncStorage.getItem('wsUser');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  };

  const readSavedContacts = async (key: string): Promise<Contact[]> => {
    try {
      const raw = Platform.OS === 'web'
        ? getWebStorage()?.getItem?.(key)
        : await AsyncStorage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((c: any) => ({
        id: Number(c.id) || Date.now(),
        name: String(c.name || '').trim(),
        phone: String(c.phone || '').trim(),
        relation: String(c.relation || 'Contact').trim(),
        initials: String(c.initials || getInitials(String(c.name || ''))),
        color: String(c.color || COLORS[0]),
        primary: Boolean(c.primary),
      })).filter((c: Contact) => c.name && c.phone);
    } catch { return []; }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      const user = await readUser();
      const id = String(user?.uid || user?.id || user?.email || user?.phone || 'guest').trim().toLowerCase();
      const key = `wsapp_emergency_contacts_${id}`;
      const saved = await readSavedContacts(key);
      if (!active) return;
      setStorageKey(key);
      setContacts(saved);
    })();
    return () => { active = false; };
  }, []);

  const saveContacts = async (next: Contact[]) => {
    setContacts(next);
    try {
      const value = JSON.stringify(next);
      if (Platform.OS === 'web') getWebStorage()?.setItem?.(storageKey, value);
      else await AsyncStorage.setItem(storageKey, value);
    } catch {}
  };

  const phoneRef = useRef<TextInput>(null);
  const relRef   = useRef<TextInput>(null);

  const getInitials = (n: string) =>
    n.split(' ').map(x => x[0]).join('').toUpperCase().slice(0, 2) || '??';

  const setPrimary = (id: number) => {
    saveContacts(
      contacts.map(c => ({
        ...c,
        primary: c.id === id,
      }))
    );
  };

  const addContact = () => {
    if (!newName.trim() || !newPhone.trim()) {
      Alert.alert('Missing Info', 'Please enter name and phone number');
      return;
    }
    if (contacts.length >= 5) {
      Alert.alert('Limit Reached', 'Maximum 5 emergency contacts allowed');
      return;
    }
    const c: Contact = {
      id:       Date.now(),
      name:     newName.trim(),
      phone:    newPhone.trim(),
      relation: newRel.trim() || 'Contact',
      initials: getInitials(newName),
      color:    COLORS[contacts.length % COLORS.length],
    };
    const next = [...contacts, c];
    if (next.length === 1) {
      next[0].primary = true;
    }
    saveContacts(next);
    setNewName('');
    setNewPhone('');
    setNewRel('');
    setShowForm(false);
  };

  const deleteContact = (id: number) => {
    Alert.alert('Delete Contact', 'Remove this emergency contact?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          const removed = contacts.find(c => c.id === id);
          const next = contacts.filter(c => c.id !== id);

          if (removed?.primary && next.length > 0 && !next.some(c => c.primary)) {
            next[0] = { ...next[0], primary: true };
          }

          saveContacts(next);
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.container}>
        <ScreenBackground opacity={0.18} mobileOpacity={0.10} desktopWidth="55%" />

        {/* Overlay */}
        <View style={styles.overlay} />

        <StatusBar barStyle="light-content" backgroundColor="#1A0310" />
        <View style={styles.glowTL} />
        <View style={styles.glowBR} />

        {/* TOP BAR */}
        <View style={[styles.topBar, isMobile && styles.topBarMobile]}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backTxt}>← Home</Text>
          </TouchableOpacity>
          <Text style={styles.topTitle}>Emergency Contacts</Text>
          <TouchableOpacity
            style={[styles.addTopBtn, contacts.length >= 5 && styles.addTopBtnDisabled]}
            onPress={() => contacts.length < 5 && setShowForm(true)}
          >
            <Text style={styles.addTopBtnTxt}>+ Add</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={[styles.scroll, !isMobile && styles.scrollDesktop]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* HERO */}
          <View style={styles.heroCard}>
            <View style={styles.heroTopLine} />
            <Text style={styles.heroEye}>✦ SAFETY NETWORK ✦</Text>
            <Text style={styles.heroTitle}>Emergency Contacts</Text>
            <Text style={styles.heroSub}>These people get SMS + location when SOS is pressed</Text>
            <View style={styles.heroStatRow}>
              <View style={styles.heroStat}><Text style={styles.heroStatNum}>{contacts.length}</Text><Text style={styles.heroStatLbl}>Added</Text></View>
              <View style={styles.heroStatDiv} />
              <View style={styles.heroStat}><Text style={styles.heroStatNum}>{5 - contacts.length}</Text><Text style={styles.heroStatLbl}>Slots Left</Text></View>
              <View style={styles.heroStatDiv} />
              <View style={styles.heroStat}><Text style={styles.heroStatNum}>5</Text><Text style={styles.heroStatLbl}>Max</Text></View>
            </View>
          </View>

          {/* SECTION HEADER */}
          <View style={styles.secHd}>
            <View style={styles.secLine} /><Text style={styles.secTxt}>Saved Contacts</Text><View style={styles.secLine} />
          </View>

          {/* CONTACT LIST */}
          {contacts.map((c) => (
            <View key={c.id} style={[styles.contactCard, c.primary && styles.contactCardPrimary]}>
              <View style={[styles.avatar, { borderColor: c.color }]}>
                <Text style={[styles.avatarTxt, { color: c.color }]}>{c.initials}</Text>
              </View>
              <View style={styles.info}>
                <View style={styles.nameRow}>
                  <Text style={styles.cName}>{c.name}</Text>
                  {c.primary && <View style={styles.primaryBadge}><Text style={styles.primaryBadgeTxt}>⭐ PRIMARY</Text></View>}
                </View>
                <Text style={styles.cPhone}>{c.phone}</Text>
                <Text style={styles.cRelation}>{c.relation}</Text>
              </View>
              <View style={styles.cActions}>
                <TouchableOpacity style={styles.callBtn} onPress={() => Linking.openURL(`tel:${c.phone}`)}>
                  <Text style={{ fontSize: 16 }}>📞</Text>
                </TouchableOpacity>

                {!c.primary && (
                  <TouchableOpacity style={styles.primarySetBtn} onPress={() => setPrimary(c.id)}>
                    <Text style={styles.primarySetTxt}>⭐</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteContact(c.id)}>
                  <Text style={{ fontSize: 16 }}>🗑</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {/* EMPTY STATE */}
          {contacts.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={{ fontSize: 48, marginBottom: 14 }}>👥</Text>
              <Text style={styles.emptyTitle}>No Contacts Yet</Text>
              <Text style={styles.emptySub}>Add emergency contacts so they get alerted when you press SOS</Text>
            </View>
          )}

          {/* ADD FORM */}
          {showForm ? (
            <View style={styles.formCard}>
              <View style={styles.cardTopLine} />
              <Text style={styles.formTitle}>➕ Add Emergency Contact</Text>

              <View style={styles.fg}>
                <Text style={styles.flbl}>FULL NAME *</Text>
                <View style={styles.iw}>
                  <Text style={styles.iico}>👤</Text>
                  <TextInput
                    style={[styles.inp, { outlineStyle: 'none' } as any]}
                    placeholder="Contact's full name"
                    placeholderTextColor="rgba(255,255,255,0.22)"
                    value={newName}
                    onChangeText={setNewName}
                    returnKeyType="next"
                    onSubmitEditing={() => phoneRef.current?.focus()}
                  />
                </View>
              </View>

              <View style={styles.fg}>
                <Text style={styles.flbl}>PHONE NUMBER *</Text>
                <View style={styles.iw}>
                  <Text style={styles.iico}>📱</Text>
                  <TextInput
                    ref={phoneRef}
                    style={[styles.inp, { outlineStyle: 'none' } as any]}
                    placeholder="+91 XXXXX XXXXX"
                    placeholderTextColor="rgba(255,255,255,0.22)"
                    value={newPhone}
                    onChangeText={setNewPhone}
                    keyboardType="phone-pad"
                    returnKeyType="next"
                    onSubmitEditing={() => relRef.current?.focus()}
                  />
                </View>
              </View>

              <View style={styles.fg}>
                <Text style={styles.flbl}>RELATION (Optional)</Text>
                <View style={styles.iw}>
                  <Text style={styles.iico}>🤝</Text>
                  <TextInput
                    ref={relRef}
                    style={[styles.inp, { outlineStyle: 'none' } as any]}
                    placeholder="e.g. Mother, Sister, Friend"
                    placeholderTextColor="rgba(255,255,255,0.22)"
                    value={newRel}
                    onChangeText={setNewRel}
                    returnKeyType="done"
                    onSubmitEditing={addContact}
                  />
                </View>
              </View>

              <View style={styles.formActions}>
                <TouchableOpacity style={styles.saveBtn} onPress={addContact} activeOpacity={0.85}>
                  <Text style={styles.saveBtnTxt}>✓  Save Contact</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowForm(false); setNewName(''); setNewPhone(''); setNewRel(''); }}>
                  <Text style={styles.cancelBtnTxt}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            contacts.length < 5 && (
              <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm(true)} activeOpacity={0.8}>
                <Text style={styles.addBtnIco}>+</Text>
                <Text style={styles.addBtnTxt}>Add Emergency Contact</Text>
                <Text style={styles.addBtnSlots}>{contacts.length}/5</Text>
              </TouchableOpacity>
            )
          )}

          {/* INFO */}
          <View style={styles.infoCard}>
            <Text style={{ fontSize: 18 }}>💡</Text>
            <Text style={styles.infoTxt}>Maximum 5 contacts. They get SMS + live location when SOS is pressed.</Text>
          </View>

          {/* FOOTER */}
          <View style={styles.footer}>
            <View style={styles.footerLine} />
            <Text style={styles.footerTxt}>Always With You</Text>
            <Text style={styles.footerSub}>Women Safety Application</Text>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#1A0310' },

  glowTL: { position: 'absolute', top: -60, left: -60, width: 240, height: 240, borderRadius: 120, backgroundColor: 'rgba(92,10,45,0.45)', zIndex: 0 },
  glowBR: { position: 'absolute', bottom: -60, right: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(11,110,79,0.1)', zIndex: 0 },

  topBar:      { backgroundColor: 'rgba(20,2,12,0.92)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(201,168,76,0.22)', zIndex: 10 },
  topBarMobile:{ paddingTop: 44 },
  backTxt:     { color: '#C9A84C', fontSize: 13, fontWeight: '700' },
  topTitle:    { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },
  addTopBtn:   { backgroundColor: 'rgba(201,168,76,0.14)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.35)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  addTopBtnDisabled: { opacity: 0.35 },
  addTopBtnTxt:{ color: '#C9A84C', fontSize: 12, fontWeight: '700' },

  scroll:        { alignItems: 'center', paddingBottom: 30 },
  scrollDesktop: { paddingHorizontal: 40, maxWidth: 680, alignSelf: 'center', width: '100%' },

  heroCard:    { width: '100%', backgroundColor: 'rgba(20,2,12,0.75)', borderBottomWidth: 1, borderBottomColor: 'rgba(201,168,76,0.15)', padding: 24, marginBottom: 20, position: 'relative', overflow: 'hidden', zIndex: 2 },
  heroTopLine: { position: 'absolute', top: 0, left: '10%', right: '10%', height: 1, backgroundColor: 'rgba(201,168,76,0.32)' },
  heroEye:     { color: 'rgba(201,168,76,0.62)', fontSize: 10, fontWeight: '700', letterSpacing: 2, marginBottom: 8 },
  heroTitle:   { color: '#fff', fontSize: 24, fontWeight: '900', marginBottom: 8 },
  heroSub:     { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginBottom: 16 },
  heroStatRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(201,168,76,0.07)', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(201,168,76,0.18)' },
  heroStat:    { flex: 1, alignItems: 'center' },
  heroStatNum: { color: '#C9A84C', fontSize: 22, fontWeight: '900' },
  heroStatLbl: { color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 2 },
  heroStatDiv: { width: 1, height: 30, backgroundColor: 'rgba(201,168,76,0.2)' },

  secHd:  { flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%', marginBottom: 14, paddingHorizontal: 16, zIndex: 2 },
  secLine:{ flex: 1, height: 1, backgroundColor: 'rgba(201,168,76,0.18)' },
  secTxt: { color: 'rgba(201,168,76,0.7)', fontSize: 10, fontWeight: '800', letterSpacing: 2 },

  contactCard:        { width: '100%', backgroundColor: 'rgba(20,2,12,0.8)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12, paddingHorizontal: 16, zIndex: 2 },
  contactCardPrimary: { borderColor: 'rgba(201,168,76,0.32)', backgroundColor: 'rgba(20,2,12,0.85)' },
  avatar:      { width: 50, height: 50, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarTxt:   { fontSize: 16, fontWeight: '900' },
  info:        { flex: 1 },
  nameRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  cName:       { color: '#fff', fontSize: 15, fontWeight: '800' },
  primaryBadge:   { backgroundColor: 'rgba(201,168,76,0.12)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.32)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  primaryBadgeTxt:{ color: '#C9A84C', fontSize: 9, fontWeight: '800' },
  cPhone:      { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 3 },
  cRelation:   { color: 'rgba(255,255,255,0.3)', fontSize: 11, marginTop: 1 },
  cActions:    { flexDirection: 'row', gap: 8 },
  callBtn:     { width: 38, height: 38, borderRadius: 11, backgroundColor: 'rgba(74,222,128,0.1)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.28)', alignItems: 'center', justifyContent: 'center' },
  primarySetBtn:{ width: 38, height: 38, borderRadius: 11, backgroundColor: 'rgba(201,168,76,0.09)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.24)', alignItems: 'center', justifyContent: 'center' },
  primarySetTxt:{ fontSize: 16 },
  deleteBtn:   { width: 38, height: 38, borderRadius: 11, backgroundColor: 'rgba(248,113,113,0.08)', borderWidth: 1, borderColor: 'rgba(248,113,113,0.22)', alignItems: 'center', justifyContent: 'center' },

  emptyState:  { alignItems: 'center', paddingVertical: 40, zIndex: 2 },
  emptyTitle:  { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 8 },
  emptySub:    { color: 'rgba(255,255,255,0.35)', fontSize: 13, textAlign: 'center', lineHeight: 20, paddingHorizontal: 30 },

  formCard:    { width: '100%', backgroundColor: 'rgba(20,2,12,0.88)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.25)', borderRadius: 18, padding: 20, marginBottom: 14, overflow: 'hidden', paddingHorizontal: 16, zIndex: 2 },
  cardTopLine: { position: 'absolute', top: 0, left: '15%', right: '15%', height: 1, backgroundColor: 'rgba(201,168,76,0.4)' },
  formTitle:   { color: '#C9A84C', fontSize: 14, fontWeight: '800', marginBottom: 18 },
  fg:          { marginBottom: 14 },
  flbl:        { color: 'rgba(201,168,76,0.65)', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 7 },
  iw:          { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.11)', borderRadius: 13, paddingHorizontal: 14 },
  iico:        { fontSize: 16, marginRight: 10 },
  inp:         { flex: 1, color: '#fff', fontSize: 14, paddingVertical: 12 },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  saveBtn:     { flex: 1, backgroundColor: '#C9A84C', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  saveBtnTxt:  { color: '#1A0310', fontSize: 13, fontWeight: '900' },
  cancelBtn:   { borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 12, paddingVertical: 13, paddingHorizontal: 20, alignItems: 'center' },
  cancelBtnTxt:{ color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: '600' },

  addBtn:      { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: 'rgba(20,2,12,0.7)', borderWidth: 1.5, borderColor: 'rgba(201,168,76,0.28)', borderStyle: 'dashed', borderRadius: 16, paddingVertical: 16, marginBottom: 16, paddingHorizontal: 16, zIndex: 2 },
  addBtnIco:   { color: '#C9A84C', fontSize: 22, fontWeight: '300' },
  addBtnTxt:   { color: 'rgba(201,168,76,0.72)', fontSize: 14, fontWeight: '700' },
  addBtnSlots: { color: 'rgba(255,255,255,0.25)', fontSize: 12, fontWeight: '600', marginLeft: 4 },

  infoCard:    { width: '100%', flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: 'rgba(20,2,12,0.75)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.18)', borderRadius: 12, padding: 14, marginBottom: 20, paddingHorizontal: 16, zIndex: 2 },
  infoTxt:     { flex: 1, color: 'rgba(255,255,255,0.42)', fontSize: 12, lineHeight: 18 },

  footer:      { width: '100%', alignItems: 'center', paddingVertical: 20, zIndex: 2 },
  footerLine:  { width: 60, height: 1, backgroundColor: 'rgba(201,168,76,0.3)', marginBottom: 14 },
  footerTxt:   { color: 'rgba(201,168,76,0.65)', fontSize: 13, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' },
  footerSub:   { color: 'rgba(255,255,255,0.22)', fontSize: 10, marginTop: 4 },

  bgImage: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    top: 0,
    width: '55%',
    height: '100%',
    opacity: 0.18,
  },
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(26,3,16,0.72)',
    zIndex: 0,
  },
});

