import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import ScreenBackground from '../components/ScreenBackground';

// ── Women BG ──────────────────────────────

// ── Types ─────────────────────────────────
interface Message {
  id: number;
  text: string;
  sender: 'user' | 'ai';
}

// ── Smart AI Response Engine ───────────────
const getSmartResponse = (input: string): string => {
  const msg = input.toLowerCase().trim();

  if (msg.match(/attack|danger|help me|kidnap|chase|threat|weapon|hit|beat|assault/i))
    return ['🚨 CALL 100 NOW! Press the SOS button immediately. Move to a crowded place and scream loudly. I am with you — you are brave! 💪',
            '🆘 Run to safety NOW! Call 100 (Police) immediately. Press SOS button in the app. You are not alone — I am right here! 💚'][Math.floor(Math.random()*2)];

  if (msg.match(/follow|stalk|watching|behind me|spy/i))
    return ['😰 Walk into any shop, call 100, press SOS, share your live location. Don\'t go home directly! 🛡️',
            '📍 Walk into a busy place RIGHT NOW! Call someone and stay on the phone. Press SOS button. 💪'][Math.floor(Math.random()*2)];

  if (msg.match(/abuse|husband|boyfriend|domestic|violence|slap|torture|beat/i))
    return ['💔 This is NOT your fault. Call 1091 (Women Helpline) for immediate help. You deserve safety! 💚',
            '🤝 Domestic violence is a CRIME. Call 1091 now. Shelter homes are ready to help you! ❤️'][Math.floor(Math.random()*2)];

  if (msg.match(/harass|eve teas|comment|catcall|groped|touch/i))
    return ['😤 This is ILLEGAL! Report at police station or call 1091. Your voice matters! 💪',
            '🛡️ Call 1091 or file complaint at cybercrime.gov.in. You have every right to be safe! ⚖️'][Math.floor(Math.random()*2)];

  if (msg.match(/cyber|online|photo leak|blackmail|hack|instagram|whatsapp/i))
    return ['💻 Cyber crime — call 1930 immediately! Report at cybercrime.gov.in. Don\'t pay — that\'s blackmail! 🛡️',
            '📱 Report at cybercrime.gov.in or call 1930. Save all evidence. Police WILL help you! 💪'][Math.floor(Math.random()*2)];

  if (msg.match(/scared|fear|unsafe|terrified|anxious|panic|bayama|bayam/i))
    return ['💚 Your feelings are valid. Take 3 deep breaths. Tell me what\'s happening — I am listening! 🌸',
            '🤗 Fear means your body is protecting you. Tell me what\'s making you feel unsafe! 💜'][Math.floor(Math.random()*2)];

  if (msg.match(/sad|cry|depress|hopeless|alone|nobody|broken|hurt/i))
    return ['💜 Your pain is real. Please call iCall: 9152987821 — free counseling. You don\'t have to carry this alone! 🌸',
            '🌟 You matter so much! iCall: 9152987821 has counselors ready to help. You deserve support! 💚'][Math.floor(Math.random()*2)];

  if (msg.match(/suicide|kill myself|want to die|end my life|self harm/i))
    return ['🆘 Please call iCall: 9152987821 or Vandrevala: 1860-2662-345 RIGHT NOW. Your life is precious! 💚',
            '💜 Call 9152987821 immediately — free, 24/7. If in danger call 100. You are loved! 🙏'][Math.floor(Math.random()*2)];

  if (msg.match(/night|late|cab|auto|travelling alone|going home/i))
    return ['🌙 Share live location, note cab number, sit behind driver, stay on call. Trust your instincts! 💪',
            '🚗 Share your route before travelling alone! Note vehicle number, keep 100 on speed dial! 🛡️'][Math.floor(Math.random()*2)];

  if (msg.match(/helpline|number|emergency number|contact/i))
    return '📞 Emergency Numbers:\n🚔 Police: 100\n👩 Women Helpline: 1091\n🚑 Ambulance: 108\n💬 iCall: 9152987821\n🌐 Cyber Crime: 1930\n☎️ One Stop: 181\n\nSave ALL these now! 💚';

  if (msg.match(/naan safe|i am safe|safe now|better now|thank/i))
    return ['🎉 So relieved you are safe! WS App is always here 24/7. Stay strong! 💚',
            '😊 Wonderful! Keep emergency numbers saved. SOS button is always ready. You are brave! 🌟'][Math.floor(Math.random()*2)];

  if (msg.match(/^(hi|hello|hey|vanakkam|namaste|hii|hai)$/i))
    return ['💚 Hello! I am your WS App AI Support — here for you 24/7. How are you feeling today? 🌸',
            '🌟 Hi there! This is your safe space. Tell me anything. I am always here! 💜'][Math.floor(Math.random()*2)];

  if (msg.match(/bayama iruku|kastama iruku|help venum|pedi/i))
    return ['💚 நான் இங்கே இருக்கேன்! என்ன ஆச்சுன்னு சொல்லுங்க — நான் கேக்குறேன். நீங்க தனியா இல்லை! 🤝',
            '🌸 பயப்படாதீங்க! நான் உங்களோட இருக்கேன். என்ன நடந்துச்சுன்னு சொல்லுங்க! 💜'][Math.floor(Math.random()*2)];

  const defaults = [
    '💚 I hear you and I am here. Tell me more — what is happening? You are safe here! 🌸',
    '🤝 Thank you for trusting me. What do you need right now? I am listening! 💜',
    '🛡️ You reached out — that takes courage. Are you safe right now? I am here 24/7! 💚',
    '😊 This is your safe space — no judgment, only care. Tell me what\'s on your mind! 🌸',
  ];
  return defaults[Math.floor(Math.random() * defaults.length)];
};

// ── Initial Messages ───────────────────────
const INITIAL: Message[] = [
  { id: 1, text: 'Hello! I am your WS App AI Support 💚 I am here to help you anytime. How are you feeling today?', sender: 'ai' },
  { id: 2, text: 'You can talk to me about anything — safety tips, emergency help, emotional support, or just to chat. I support Tamil & English! 🌸', sender: 'ai' },
];

// ── Component ─────────────────────────────
export default function SupportScreen() {
  const { width } = useWindowDimensions();
  const isMobile  = width < 768;

  const [message, setMessage]   = useState('');
  const [messages, setMessages] = useState<Message[]>(INITIAL);
  const [loading, setLoading]   = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const scrollToBottom = () =>
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);

  const sendMessage = async (override?: string) => {
    const text = (override ?? message).trim();
    if (!text || loading) return;

    const userMsg: Message = { id: Date.now(), text, sender: 'user' };
    setMessages(p => [...p, userMsg]);
    setMessage('');
    setLoading(true);
    scrollToBottom();

    await new Promise(r => setTimeout(r, 800 + Math.random() * 600));

    const aiText = getSmartResponse(text);
    setMessages(p => [...p, { id: Date.now() + 1, text: aiText, sender: 'ai' }]);
    setLoading(false);
    scrollToBottom();
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* ── BACKGROUND IMAGE ── */}
      <ScreenBackground opacity={0.18} mobileOpacity={0.10} desktopWidth="55%" />

      {/* ── DARK OVERLAY ── */}
      <View style={styles.overlay} />

      {/* ── BG GLOWS ── */}
      <View style={styles.glowTL} />
      <View style={styles.glowBR} />

      {/* ── MAIN CONTENT ── */}
      <View style={styles.container}>

        {/* TOP BAR */}
        <View style={[styles.topBar, isMobile && styles.topBarMobile]}>
          <TouchableOpacity onPress={() => router.push('/' as any)} activeOpacity={0.7}>
            <Text style={styles.backTxt}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.topTitle}>Safe Space</Text>
          <View style={styles.onlineDot} />
        </View>

        {/* HERO */}
        <View style={styles.hero}>
          <View style={styles.heroTopLine} />
          <Text style={styles.heroEye}>✦ 24/7 AI SUPPORT ✦</Text>
          <Text style={styles.heroTitle}>You Are{'\n'}Not Alone</Text>
          <View style={styles.goldLine} />
          <Text style={styles.heroSub}>Smart AI — Tamil & English — always here</Text>
        </View>

        {/* OPTION CARDS */}
        <View style={styles.optRow}>
          {[
            { i: '🤖', t: 'AI Support',   s: 'Always available' },
            { i: '👩', t: 'Team Support', s: '5 min response'   },
            { i: '📞', t: 'Helpline',     s: 'Call 1091'        },
          ].map((o, idx) => (
            <View key={idx} style={styles.optCard}>
              <Text style={styles.optIco}>{o.i}</Text>
              <Text style={styles.optT}>{o.t}</Text>
              <Text style={styles.optS}>{o.s}</Text>
            </View>
          ))}
        </View>

        {/* QUICK BUTTONS */}
        <View style={styles.quickRow}>
          {['I need help 🆘', 'I feel unsafe 😰', 'Safety tips 🛡️', 'Helplines 📞', 'I am scared 😨', 'Talk to team 👩'].map((q, i) => (
            <TouchableOpacity key={i} style={styles.quickBtn} onPress={() => sendMessage(q)} activeOpacity={0.75}>
              <Text style={styles.quickTxt}>{q}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* CHAT AREA */}
        <ScrollView
          ref={scrollRef}
          style={styles.chatArea}
          contentContainerStyle={styles.chatContent}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={scrollToBottom}
          showsVerticalScrollIndicator={false}
        >
          {messages.map(msg => (
            <View key={msg.id} style={[styles.bubble, msg.sender === 'user' ? styles.bubbleUser : styles.bubbleAI]}>
              {msg.sender === 'ai' && (
                <View style={styles.aiAv}>
                  <Text style={styles.aiAvTxt}>AI</Text>
                </View>
              )}
              <View style={[styles.bubbleTxt, msg.sender === 'user' ? styles.bubbleTxtUser : styles.bubbleTxtAI]}>
                <Text style={[styles.bubbleMsg, msg.sender === 'user' ? styles.bubbleMsgUser : styles.bubbleMsgAI]}>
                  {msg.text}
                </Text>
              </View>
            </View>
          ))}

          {loading && (
            <View style={[styles.bubble, styles.bubbleAI]}>
              <View style={styles.aiAv}>
                <Text style={styles.aiAvTxt}>AI</Text>
              </View>
              <View style={styles.typingBubble}>
                <ActivityIndicator size="small" color="#C9A84C" />
                <Text style={styles.typingTxt}>AI is typing...</Text>
              </View>
            </View>
          )}
        </ScrollView>

        {/* INPUT BAR */}
        <View style={styles.inputBar}>
          <TextInput
            style={[styles.chatInput, { outlineStyle: 'none' } as any]}
            placeholder="Type your message here..."
            placeholderTextColor="rgba(255,255,255,0.22)"
            value={message}
            onChangeText={setMessage}
            onSubmitEditing={() => sendMessage()}
            returnKeyType="send"
            multiline={false}
            blurOnSubmit={false}
            onFocus={scrollToBottom}
          />
          <TouchableOpacity
            style={[styles.sendBtn, loading && styles.sendBtnOff]}
            onPress={() => sendMessage()}
            disabled={loading}
            activeOpacity={0.75}
          >
            <Text style={styles.sendTxt}>➤</Text>
          </TouchableOpacity>
        </View>

      </View>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1A0310' },

  /* BG image — absolute, right side, full height */
  bgFull: {
    position: 'absolute',
    top: 0, right: 0, bottom: 0,
    width: '55%',
    height: '100%',
    zIndex: 0,
  },
  bgImage: {
    opacity: 0.18,
    resizeMode: 'contain',
  },

  /* Dark overlay */
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(26,3,16,0.78)',
    zIndex: 1,
  },

  /* BG Glows */
  glowTL: { position: 'absolute', top: -60, left: -60, width: 240, height: 240, borderRadius: 120, backgroundColor: 'rgba(92,10,45,0.45)', zIndex: 0 },
  glowBR: { position: 'absolute', bottom: 80, right: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(11,110,79,0.1)', zIndex: 0 },

  /* Main content above overlay */
  container: { flex: 1, zIndex: 2 },

  topBar:       { backgroundColor: 'rgba(20,2,12,0.92)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(201,168,76,0.22)' },
  topBarMobile: { paddingTop: 44 },
  backTxt:      { color: '#C9A84C', fontSize: 13, fontWeight: '700' },
  topTitle:     { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 1 },
  onlineDot:    { width: 10, height: 10, borderRadius: 5, backgroundColor: '#4ade80', shadowColor: '#4ade80', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 4, elevation: 3 },

  hero:        { backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(201,168,76,0.15)', position: 'relative', overflow: 'hidden' },
  heroTopLine: { position: 'absolute', top: 0, left: '10%', right: '10%', height: 1, backgroundColor: 'rgba(201,168,76,0.3)' },
  heroEye:     { color: 'rgba(201,168,76,0.62)', fontSize: 9, fontWeight: '700', letterSpacing: 2, marginBottom: 6 },
  heroTitle:   { color: '#fff', fontSize: 22, fontWeight: '900', lineHeight: 28 },
  goldLine:    { width: 40, height: 1.5, backgroundColor: '#C9A84C', marginVertical: 8 },
  heroSub:     { color: 'rgba(255,255,255,0.35)', fontSize: 11 },

  optRow:  { flexDirection: 'row', padding: 10, gap: 8 },
  optCard: { flex: 1, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderTopWidth: 2, borderTopColor: 'rgba(201,168,76,0.35)' },
  optIco:  { fontSize: 20, marginBottom: 4 },
  optT:    { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },
  optS:    { fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 2 },

  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 10, paddingBottom: 6 },
  quickBtn: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(201,168,76,0.22)' },
  quickTxt: { fontSize: 10, color: 'rgba(201,168,76,0.82)', fontWeight: '600' },

  chatArea:    { flex: 1 },
  chatContent: { padding: 10, paddingBottom: 16 },

  bubble:      { flexDirection: 'row', marginBottom: 10, alignItems: 'flex-end' },
  bubbleUser:  { justifyContent: 'flex-end' },
  bubbleAI:    { justifyContent: 'flex-start' },
  aiAv:        { width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(92,10,45,0.6)', borderWidth: 1, borderColor: '#C9A84C', alignItems: 'center', justifyContent: 'center', marginRight: 6, flexShrink: 0 },
  aiAvTxt:     { fontSize: 8, color: '#C9A84C', fontWeight: '900' },
  bubbleTxt:   { maxWidth: '78%', borderRadius: 14, padding: 10 },
  bubbleTxtUser:   { backgroundColor: 'rgba(92,10,45,0.5)', borderBottomRightRadius: 4, borderWidth: 1, borderColor: 'rgba(201,168,76,0.3)' },
  bubbleTxtAI:     { backgroundColor: 'rgba(255,255,255,0.07)', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  bubbleMsg:       { fontSize: 12, lineHeight: 18 },
  bubbleMsgUser:   { color: '#C9A84C' },
  bubbleMsgAI:     { color: 'rgba(255,255,255,0.85)' },
  typingBubble:    { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 14, padding: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  typingTxt:       { fontSize: 11, color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' },

  inputBar:  { flexDirection: 'row', padding: 10, gap: 8, backgroundColor: 'rgba(20,2,12,0.92)', borderTopWidth: 1, borderTopColor: 'rgba(201,168,76,0.18)', alignItems: 'center', paddingBottom: Platform.OS === 'ios' ? 24 : 10 },
  chatInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1.5, borderColor: 'rgba(201,168,76,0.28)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: Platform.OS === 'ios' ? 12 : 10, fontSize: 12, color: '#fff', minHeight: 42 },
  sendBtn:   { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(201,168,76,0.2)', borderWidth: 1.5, borderColor: '#C9A84C', alignItems: 'center', justifyContent: 'center' },
  sendBtnOff:{ opacity: 0.4 },
  sendTxt:   { color: '#C9A84C', fontSize: 16, fontWeight: '800' },
});
