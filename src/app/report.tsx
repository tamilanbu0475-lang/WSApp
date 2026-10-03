import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View
} from 'react-native';
import ScreenBackground from '../components/ScreenBackground';

const CATEGORIES = ['Harassment', 'Stalking', 'Abuse', 'Threat', 'Cyber Crime', 'Other'];
const API_URL = 'https://wsapp-9w4r.onrender.com';

type Complaint = {
  id: string;
  category: string;
  description: string;
  location?: string;
  status?: string;
  adminResponse?: string;
  createdAt?: string | { seconds?: number };
  updatedAt?: string | { seconds?: number };
  resolvedAt?: string | { seconds?: number };
};

function getStorage() {
  return typeof globalThis !== 'undefined' ? (globalThis as any).localStorage : null;
}

function getClientKey() {
  try {
    const storage = getStorage();
    if (!storage) return '';
    const existing = storage.getItem('wsComplaintClientKey');
    if (existing && existing.length >= 20) return existing;
    const generated =
      (typeof crypto !== 'undefined' && (crypto as any).randomUUID)
        ? (crypto as any).randomUUID()
        : `ws-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    storage.setItem('wsComplaintClientKey', generated);
    return generated;
  } catch {
    return '';
  }
}

function parseDate(value: any) {
  if (!value) return null;
  if (typeof value === 'string') return new Date(value);
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000);
  }
  return null;
}

function formatDate(value: any) {
  const d = parseDate(value);
  if (!d || Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function normalizeStatus(value: string | undefined) {
  return String(value || 'pending').toLowerCase().replace(/\s+/g, '_');
}

function statusLabel(status: string | undefined) {
  const s = normalizeStatus(status);
  if (s === 'under_review') return 'UNDER REVIEW';
  if (s === 'resolved') return 'RESOLVED';
  if (s === 'rejected') return 'REJECTED';
  return 'PENDING';
}

export default function ReportScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [submittedId, setSubmittedId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadingReports, setLoadingReports] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reports, setReports] = useState<Complaint[]>([]);

  const loadReports = useCallback(async () => {
    const clientKey = getClientKey();
    if (!clientKey) {
      setLoadingReports(false);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/complaints/public?clientKey=${encodeURIComponent(clientKey)}`);
      const data = await res.json();
      if (res.ok && data?.success) {
        setReports(Array.isArray(data.complaints) ? data.complaints : []);
      }
    } catch {
      // Keep existing UI state when offline/unavailable.
    } finally {
      setLoadingReports(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadReports();
    setRefreshing(false);
  };

  const submitReport = async () => {
    if (!category || description.trim().length < 10) {
      Alert.alert('Incomplete Report', 'Select a category and enter at least 10 characters describing the incident.');
      return;
    }

    const clientKey = getClientKey();
    if (!clientKey) {
      Alert.alert('Unable to Submit', 'Please refresh the page and try again.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/complaints/public`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientKey,
          category,
          description: description.trim(),
          location: location.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || 'Unable to submit complaint.');
      }

      setSubmittedId(String(data.id || ''));
      setCategory('');
      setDescription('');
      setLocation('');
      await loadReports();
    } catch (e: any) {
      Alert.alert('Submission Failed', e?.message || 'Unable to submit complaint right now.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submittedId) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
        <ScreenBackground opacity={0.18} mobileOpacity={0.10} desktopWidth="55%" />
        <View style={styles.overlay} />
        <StatusBar barStyle="light-content" backgroundColor="#1A0310" />
        <View style={styles.successCard}>
          <View style={styles.successTopLine} />
          <View style={styles.successIco}><Text style={{ fontSize: 44 }}>✅</Text></View>
          <Text style={styles.successTitle}>Report Submitted!</Text>
          <Text style={styles.successSub}>
            Your complaint has been securely recorded. You can track its status and admin response below.
          </Text>
          <View style={styles.successBadge}>
            <Text style={styles.successBadgeTxt}>🔒 IDENTITY PROTECTED</Text>
          </View>
          <View style={styles.refBox}>
            <Text style={styles.refLabel}>REFERENCE ID</Text>
            <Text style={styles.refValue}>{submittedId}</Text>
            <Text style={styles.refStatus}>STATUS: PENDING</Text>
          </View>
          <View style={styles.successBtns}>
            <TouchableOpacity style={styles.homeBtn} onPress={() => setSubmittedId('')}>
              <Text style={styles.homeBtnTxt}>View My Reports</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.replace('/' as any)}>
              <Text style={styles.secondaryBtnTxt}>← Back to Home</Text>
            </TouchableOpacity>
          </View>
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
        <TouchableOpacity onPress={() => router.replace('/' as any)}>
          <Text style={styles.backTxt}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>Report Incident</Text>
        <View style={styles.anonBadge}><Text style={styles.anonTxt}>🔒 ANON</Text></View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, !isMobile && styles.scrollDesktop]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C9A84C" />}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroTopLine} />
          <Text style={styles.heroEye}>✦ ANONYMOUS REPORT ✦</Text>
          <Text style={styles.heroTitle}>Report an Incident</Text>
          <Text style={styles.heroSub}>Your identity is protected. Report safely and confidentially.</Text>
        </View>

        <View style={[styles.card, !isMobile && styles.cardDesktop]}>
          <View style={styles.cardTopLine} />

          <Text style={styles.sectionTitle}>Select Category</Text>
          <View style={styles.catGrid}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[styles.catChip, category === cat && styles.catChipActive]}
                onPress={() => setCategory(cat)}
                activeOpacity={0.75}
              >
                <Text style={[styles.catTxt, category === cat && styles.catTxtActive]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionTitle}>What Happened?</Text>
          <TextInput
            style={[styles.textarea, { outlineStyle: 'none' } as any]}
            placeholder="Describe the incident in detail..."
            placeholderTextColor="rgba(255,255,255,0.2)"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={5}
          />
          <Text style={styles.helperTxt}>{description.trim().length}/10 minimum characters</Text>

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

          <View style={styles.anonNote}>
            <Text style={{ fontSize: 16 }}>🔒</Text>
            <Text style={styles.anonNoteTxt}>
              Your identity is protected. Your report is stored confidentially and is not publicly displayed.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={submitReport}
            activeOpacity={0.85}
            disabled={submitting}
          >
            {submitting ? <ActivityIndicator color="#1A0310" /> : <Text style={styles.submitTxt}>📋  Submit Report</Text>}
          </TouchableOpacity>
        </View>

        <View style={[styles.card, !isMobile && styles.cardDesktop]}>
          <View style={styles.cardTopLine} />
          <View style={styles.historyHd}>
            <View>
              <Text style={styles.sectionHead}>My Complaint Status</Text>
              <Text style={styles.historySub}>Track admin review and responses</Text>
            </View>
            <TouchableOpacity onPress={loadReports} style={styles.refreshBtn}>
              <Text style={styles.refreshTxt}>↻</Text>
            </TouchableOpacity>
          </View>

          {loadingReports ? (
            <View style={styles.loadingBox}><ActivityIndicator color="#C9A84C" /><Text style={styles.loadingTxt}>Loading your reports...</Text></View>
          ) : reports.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={{ fontSize: 36 }}>📋</Text>
              <Text style={styles.emptyTitle}>No reports yet</Text>
              <Text style={styles.emptySub}>Your submitted complaints will appear here.</Text>
            </View>
          ) : (
            reports.map((report, index) => {
              const st = normalizeStatus(report.status);
              return (
                <View key={report.id} style={[styles.reportItem, index === reports.length - 1 && { marginBottom: 0 }]}>
                  <View style={styles.reportTopRow}>
                    <View style={styles.reportCatWrap}>
                      <Text style={styles.reportCat}>{report.category}</Text>
                      <Text style={styles.reportDate}>{formatDate(report.createdAt)}</Text>
                    </View>
                    <View style={[styles.statusBadge, st === 'resolved' ? styles.statusResolved : st === 'under_review' ? styles.statusReview : st === 'rejected' ? styles.statusRejected : styles.statusPending]}>
                      <Text style={[styles.statusTxt, st === 'resolved' ? styles.statusTxtResolved : st === 'under_review' ? styles.statusTxtReview : st === 'rejected' ? styles.statusTxtRejected : styles.statusTxtPending]}>
                        {statusLabel(report.status)}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.reportDescription}>{report.description}</Text>
                  {!!report.location && <Text style={styles.reportLocation}>📍 {report.location}</Text>}

                  <View style={styles.timelineRow}>
                    <View style={[styles.dot, st !== 'pending' && styles.dotActive]} />
                    <Text style={styles.timelineTxt}>Submitted</Text>
                    <View style={styles.timelineLine} />
                    <View style={[styles.dot, (st === 'under_review' || st === 'resolved') && styles.dotActive]} />
                    <Text style={styles.timelineTxt}>Review</Text>
                    <View style={styles.timelineLine} />
                    <View style={[styles.dot, st === 'resolved' && styles.dotActive]} />
                    <Text style={styles.timelineTxt}>Resolved</Text>
                  </View>

                  {report.adminResponse ? (
                    <View style={styles.responseBox}>
                      <Text style={styles.responseLabel}>🛡 ADMIN RESPONSE</Text>
                      <Text style={styles.responseTxt}>{report.adminResponse}</Text>
                    </View>
                  ) : (
                    <View style={styles.waitingBox}>
                      <Text style={styles.waitingTxt}>⏳ Waiting for admin response</Text>
                    </View>
                  )}
                </View>
              );
            })
          )}
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
  container: { flex: 1, backgroundColor: '#1A0310' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(26,3,16,0.72)', zIndex: 0 },
  glowTL: { position: 'absolute', top: -60, left: -60, width: 240, height: 240, borderRadius: 120, backgroundColor: 'rgba(92,10,45,0.45)' },
  glowBR: { position: 'absolute', bottom: -60, right: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(11,110,79,0.1)' },
  topBar: { backgroundColor: 'rgba(30,3,16,0.85)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(201,168,76,0.2)', zIndex: 2 },
  topBarMobile: { paddingTop: 40 },
  backTxt: { color: '#C9A84C', fontSize: 13, fontWeight: '700' },
  topTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  anonBadge: { backgroundColor: 'rgba(74,222,128,0.1)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.25)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  anonTxt: { color: '#4ade80', fontSize: 10, fontWeight: '800' },
  scroll: { alignItems: 'center', paddingBottom: 30 },
  scrollDesktop: { paddingHorizontal: 40, maxWidth: 720, alignSelf: 'center', width: '100%' },
  heroCard: { width: '100%', backgroundColor: 'rgba(255,255,255,0.06)', borderBottomWidth: 1, borderBottomColor: 'rgba(201,168,76,0.15)', padding: 24, marginBottom: 20, position: 'relative', overflow: 'hidden' },
  heroTopLine: { position: 'absolute', top: 0, left: '10%', right: '10%', height: 1, backgroundColor: 'rgba(201,168,76,0.3)' },
  heroEye: { color: 'rgba(201,168,76,0.6)', fontSize: 10, fontWeight: '700', letterSpacing: 2, marginBottom: 8 },
  heroTitle: { color: '#fff', fontSize: 24, fontWeight: '900', marginBottom: 8 },
  heroSub: { color: 'rgba(255,255,255,0.4)', fontSize: 12 },
  card: { width: '100%', backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 20, padding: 20, overflow: 'hidden', marginBottom: 16 },
  cardDesktop: { maxWidth: 680 },
  cardTopLine: { position: 'absolute', top: 0, left: '15%', right: '15%', height: 1, backgroundColor: 'rgba(201,168,76,0.3)' },
  sectionTitle: { color: 'rgba(201,168,76,0.7)', fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12, marginTop: 16 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  catChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  catChipActive: { backgroundColor: 'rgba(201,168,76,0.12)', borderColor: 'rgba(201,168,76,0.4)' },
  catTxt: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '600' },
  catTxtActive: { color: '#C9A84C', fontWeight: '800' },
  textarea: { backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 14, padding: 14, color: '#fff', fontSize: 13, minHeight: 110, textAlignVertical: 'top', marginBottom: 4 },
  helperTxt: { color: 'rgba(255,255,255,0.25)', fontSize: 10, textAlign: 'right' },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 14, paddingHorizontal: 14 },
  inputIco: { fontSize: 16, marginRight: 10 },
  input: { flex: 1, color: '#fff', fontSize: 13, paddingVertical: 13 },
  anonNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: 'rgba(74,222,128,0.06)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.15)', borderRadius: 12, padding: 12, marginTop: 16, marginBottom: 20 },
  anonNoteTxt: { flex: 1, color: 'rgba(74,222,128,0.7)', fontSize: 12, lineHeight: 18 },
  submitBtn: { backgroundColor: '#C9A84C', borderRadius: 14, paddingVertical: 16, alignItems: 'center', shadowColor: '#C9A84C', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6 },
  submitBtnDisabled: { backgroundColor: 'rgba(201,168,76,0.3)', shadowOpacity: 0 },
  submitTxt: { color: '#1A0310', fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  historyHd: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionHead: { color: '#fff', fontSize: 18, fontWeight: '900' },
  historySub: { color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 3 },
  refreshBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(201,168,76,0.1)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.2)', alignItems: 'center', justifyContent: 'center' },
  refreshTxt: { color: '#C9A84C', fontSize: 20 },
  loadingBox: { alignItems: 'center', paddingVertical: 22 },
  loadingTxt: { color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 8 },
  emptyBox: { alignItems: 'center', paddingVertical: 24 },
  emptyTitle: { color: '#fff', fontSize: 15, fontWeight: '800', marginTop: 10 },
  emptySub: { color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 4, textAlign: 'center' },
  reportItem: { backgroundColor: 'rgba(255,255,255,0.035)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 16, padding: 14, marginBottom: 12 },
  reportTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  reportCatWrap: { flex: 1 },
  reportCat: { color: '#fff', fontSize: 14, fontWeight: '800' },
  reportDate: { color: 'rgba(255,255,255,0.28)', fontSize: 10, marginTop: 3 },
  statusBadge: { borderRadius: 16, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1 },
  statusPending: { backgroundColor: 'rgba(201,168,76,0.09)', borderColor: 'rgba(201,168,76,0.22)' },
  statusReview: { backgroundColor: 'rgba(96,165,250,0.1)', borderColor: 'rgba(96,165,250,0.25)' },
  statusResolved: { backgroundColor: 'rgba(74,222,128,0.09)', borderColor: 'rgba(74,222,128,0.25)' },
  statusRejected: { backgroundColor: 'rgba(248,113,113,0.09)', borderColor: 'rgba(248,113,113,0.25)' },
  statusTxt: { fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  statusTxtPending: { color: '#C9A84C' },
  statusTxtReview: { color: '#93c5fd' },
  statusTxtResolved: { color: '#4ade80' },
  statusTxtRejected: { color: '#f87171' },
  reportDescription: { color: 'rgba(255,255,255,0.62)', fontSize: 12, lineHeight: 18, marginTop: 12 },
  reportLocation: { color: 'rgba(201,168,76,0.62)', fontSize: 10, marginTop: 8 },
  timelineRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.15)' },
  dotActive: { backgroundColor: '#4ade80' },
  timelineTxt: { color: 'rgba(255,255,255,0.34)', fontSize: 8, marginHorizontal: 4 },
  timelineLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)', minWidth: 8 },
  responseBox: { marginTop: 14, backgroundColor: 'rgba(11,110,79,0.10)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.18)', borderRadius: 12, padding: 12 },
  responseLabel: { color: '#4ade80', fontSize: 9, fontWeight: '900', letterSpacing: 1, marginBottom: 6 },
  responseTxt: { color: 'rgba(255,255,255,0.72)', fontSize: 12, lineHeight: 18 },
  waitingBox: { marginTop: 14, backgroundColor: 'rgba(201,168,76,0.06)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.12)', borderRadius: 10, padding: 10 },
  waitingTxt: { color: 'rgba(201,168,76,0.7)', fontSize: 10, fontWeight: '700' },
  footer: { width: '100%', alignItems: 'center', paddingVertical: 20 },
  footerLine: { width: 60, height: 1, backgroundColor: 'rgba(201,168,76,0.3)', marginBottom: 14 },
  footerTxt: { color: 'rgba(201,168,76,0.6)', fontSize: 13, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' },
  footerSub: { color: 'rgba(255,255,255,0.2)', fontSize: 10, marginTop: 4 },
  successCard: { width: '100%', maxWidth: 420, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.25)', borderRadius: 28, padding: 30, alignItems: 'center', gap: 14, overflow: 'hidden' },
  successTopLine: { position: 'absolute', top: 0, left: '15%', right: '15%', height: 1, backgroundColor: 'rgba(201,168,76,0.5)' },
  successIco: { width: 90, height: 90, borderRadius: 25, backgroundColor: 'rgba(11,110,79,0.12)', borderWidth: 1.5, borderColor: 'rgba(74,222,128,0.25)', alignItems: 'center', justifyContent: 'center' },
  successTitle: { color: '#fff', fontSize: 26, fontWeight: '900' },
  successSub: { color: 'rgba(255,255,255,0.45)', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  successBadge: { backgroundColor: 'rgba(74,222,128,0.1)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.25)', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20 },
  successBadgeTxt: { color: '#4ade80', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  refBox: { width: '100%', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', padding: 12, alignItems: 'center' },
  refLabel: { color: 'rgba(255,255,255,0.3)', fontSize: 8, fontWeight: '800', letterSpacing: 1.4 },
  refValue: { color: '#C9A84C', fontSize: 12, fontWeight: '900', marginTop: 4 },
  refStatus: { color: '#4ade80', fontSize: 9, fontWeight: '800', marginTop: 5 },
  successBtns: { width: '100%', gap: 9 },
  homeBtn: { backgroundColor: 'rgba(201,168,76,0.12)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.3)', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  homeBtnTxt: { color: '#C9A84C', fontSize: 13, fontWeight: '800' },
  secondaryBtn: { backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  secondaryBtnTxt: { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: '700' },
});
