import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import ScreenBackground from '../components/ScreenBackground';

const CATEGORIES = ['Harassment', 'Stalking', 'Abuse', 'Threat', 'Cyber Crime', 'Other'];


export default function ReportScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
        <ScreenBackground opacity={0.18} mobileOpacity={0.10} desktopWidth="55%" />
        <StatusBar barStyle="light-content" backgroundColor="#1A0310" />
        <View style={styles.glowTL} /><View style={styles.glowBR} />
        <View style={styles.successCard}>
          <View style={styles.successTopLine} />
          <View style={styles.successIco}><Text style={{ fontSize: 44 }}>✅</Text></View>
          <Text style={styles.successTitle}>Report Submitted!</Text>
          <Text style={styles.successSub}>Your anonymous complaint has been filed. Our team will review it within 24 hours.</Text>
          <View style={styles.successBadge}><Text style={styles.successBadgeTxt}>🔒 100% ANONYMOUS</Text></View>
          <TouchableOpacity style={styles.homeBtn} onPress={() => router.replace('/' as any)}>
            <Text style={styles.homeBtnTxt}>← Back to Home</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenBackground opacity={0.18} mobileOpacity={0.10} desktopWidth="55%" />
      <View style={styles.overlay} />
      <StatusBar barStyle="light-content" backgroundColor="#1A0310" />
      <View style={styles.glowTL} /><View style={styles.glowBR} />

      <View style={[styles.topBar, isMobile && styles.topBarMobile]}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.backTxt}>← Back</Text></TouchableOpacity>
        <Text style={styles.topTitle}>Report Incident</Text>
        <View style={styles.anonBadge}><Text style={styles.anonTxt}>🔒 ANON</Text></View>
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, !isMobile && styles.scrollDesktop]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        <View style={styles.heroCard}>
          <View style={styles.heroTopLine} />
          <Text style={styles.heroEye}>✦ ANONYMOUS REPORT ✦</Text>
          <Text style={styles.heroTitle}>Report an Incident</Text>
          <Text style={styles.heroSub}>Your identity is protected. Report safely and confidentially.</Text>
        </View>

        <View style={[styles.card, !isMobile && styles.cardDesktop]}>
          <View style={styles.cardTopLine} />

          {/* Category */}
          <Text style={styles.sectionTitle}>Select Category</Text>
          <View style={styles.catGrid}>
            {CATEGORIES.map(cat => (
              <TouchableOpacity key={cat} style={[styles.catChip, category === cat && styles.catChipActive]} onPress={() => setCategory(cat)} activeOpacity={0.75}>
                <Text style={[styles.catTxt, category === cat && styles.catTxtActive]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Description */}
          <Text style={styles.sectionTitle}>What Happened?</Text>
          <TextInput
            style={[styles.textarea, { outlineStyle: 'none' } as any]}
            placeholder="Describe the incident in detail..."
            placeholderTextColor="rgba(255,255,255,0.2)"
            value={description}
            onChangeText={setDescription}
            multiline numberOfLines={5}
          />

          {/* Location */}
          <Text style={styles.sectionTitle}>Location (Optional)</Text>
          <View style={styles.inputWrap}>
            <Text style={styles.inputIco}>📍</Text>
            <TextInput
              style={[styles.input, { outlineStyle: 'none' } as any]}
              placeholder="Area, Street, City..."
              placeholderTextColor="rgba(255,255,255,0.2)"
              value={location}
              onChangeText={setLocation}
            />
          </View>

          {/* Anon note */}
          <View style={styles.anonNote}>
            <Text style={{ fontSize: 16 }}>🔒</Text>
            <Text style={styles.anonNoteTxt}>Your name and personal details will NOT be shared. This report is completely anonymous.</Text>
          </View>

          {/* Submit */}
          <TouchableOpacity style={[styles.submitBtn, (!category || !description) && styles.submitBtnDisabled]} onPress={() => { if (category && description) setSubmitted(true); }} activeOpacity={0.85} disabled={!category || !description}>
            <Text style={styles.submitTxt}>📋  Submit Report</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <View style={styles.footerLine} />
          <Text style={styles.footerTxt}>Always With You</Text>
          <Text style={styles.footerSub}>Women Safety Application</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
    bgImage: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    top: 0,
    width: '55%',
    height: '100%',
    opacity: 0.18,
    tintColor: '#ffffff',
  },
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(26,3,16,0.72)',
    zIndex: 0,
  },
  container: { flex: 1, backgroundColor: '#1A0310' },
  glowTL: { position: 'absolute', top: -60, left: -60, width: 240, height: 240, borderRadius: 120, backgroundColor: 'rgba(92,10,45,0.45)' },
  glowBR: { position: 'absolute', bottom: -60, right: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(11,110,79,0.1)' },
  topBar: { backgroundColor: 'rgba(30,3,16,0.85)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(201,168,76,0.2)' },
  topBarMobile: { paddingTop: 40 },
  backTxt: { color: '#C9A84C', fontSize: 13, fontWeight: '700' },
  topTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  anonBadge: { backgroundColor: 'rgba(74,222,128,0.1)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.25)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  anonTxt: { color: '#4ade80', fontSize: 10, fontWeight: '800' },
  scroll: { alignItems: 'center', paddingBottom: 30 },
  scrollDesktop: { paddingHorizontal: 40, maxWidth: 680, alignSelf: 'center', width: '100%' },
  heroCard: { width: '100%', backgroundColor: 'rgba(255,255,255,0.06)', borderBottomWidth: 1, borderBottomColor: 'rgba(201,168,76,0.15)', padding: 24, marginBottom: 20, position: 'relative', overflow: 'hidden' },
  heroTopLine: { position: 'absolute', top: 0, left: '10%', right: '10%', height: 1, backgroundColor: 'rgba(201,168,76,0.3)' },
  heroEye: { color: 'rgba(201,168,76,0.6)', fontSize: 10, fontWeight: '700', letterSpacing: 2, marginBottom: 8 },
  heroTitle: { color: '#fff', fontSize: 24, fontWeight: '900', marginBottom: 8 },
  heroSub: { color: 'rgba(255,255,255,0.4)', fontSize: 12 },
  card: { width: '100%', backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 20, padding: 20, overflow: 'hidden', marginBottom: 16, paddingHorizontal: 16 },
  cardDesktop: { maxWidth: 640 },
  cardTopLine: { position: 'absolute', top: 0, left: '15%', right: '15%', height: 1, backgroundColor: 'rgba(201,168,76,0.3)' },
  sectionTitle: { color: 'rgba(201,168,76,0.7)', fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12, marginTop: 16 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  catChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  catChipActive: { backgroundColor: 'rgba(201,168,76,0.12)', borderColor: 'rgba(201,168,76,0.4)' },
  catTxt: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '600' },
  catTxtActive: { color: '#C9A84C', fontWeight: '800' },
  textarea: { backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 14, padding: 14, color: '#fff', fontSize: 13, minHeight: 110, textAlignVertical: 'top', marginBottom: 4 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 14, paddingHorizontal: 14 },
  inputIco: { fontSize: 16, marginRight: 10 },
  input: { flex: 1, color: '#fff', fontSize: 13, paddingVertical: 13 },
  anonNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: 'rgba(74,222,128,0.06)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.15)', borderRadius: 12, padding: 12, marginTop: 16, marginBottom: 20 },
  anonNoteTxt: { flex: 1, color: 'rgba(74,222,128,0.7)', fontSize: 12, lineHeight: 18 },
  submitBtn: { backgroundColor: '#C9A84C', borderRadius: 14, paddingVertical: 16, alignItems: 'center', shadowColor: '#C9A84C', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6 },
  submitBtnDisabled: { backgroundColor: 'rgba(201,168,76,0.3)', shadowOpacity: 0 },
  submitTxt: { color: '#1A0310', fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  successCard: { width: '100%', maxWidth: 380, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.25)', borderRadius: 28, padding: 36, alignItems: 'center', gap: 14, overflow: 'hidden' },
  successTopLine: { position: 'absolute', top: 0, left: '15%', right: '15%', height: 1, backgroundColor: 'rgba(201,168,76,0.5)' },
  successIco: { width: 90, height: 90, borderRadius: 25, backgroundColor: 'rgba(11,110,79,0.12)', borderWidth: 1.5, borderColor: 'rgba(74,222,128,0.25)', alignItems: 'center', justifyContent: 'center' },
  successTitle: { color: '#fff', fontSize: 26, fontWeight: '900' },
  successSub: { color: 'rgba(255,255,255,0.4)', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  successBadge: { backgroundColor: 'rgba(74,222,128,0.1)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.25)', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20 },
  successBadgeTxt: { color: '#4ade80', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  homeBtn: { backgroundColor: 'rgba(201,168,76,0.12)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.3)', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 },
  homeBtnTxt: { color: '#C9A84C', fontSize: 13, fontWeight: '800' },
  footer: { width: '100%', alignItems: 'center', paddingVertical: 20 },
  footerLine: { width: 60, height: 1, backgroundColor: 'rgba(201,168,76,0.3)', marginBottom: 14 },
  footerTxt: { color: 'rgba(201,168,76,0.6)', fontSize: 13, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' },
  footerSub: { color: 'rgba(255,255,255,0.2)', fontSize: 10, marginTop: 4 },
});
