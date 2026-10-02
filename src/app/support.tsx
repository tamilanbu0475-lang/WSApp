import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import {
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

type Mode = 'ai' | 'team';

type Message = {
  id: number;
  sender: 'ai' | 'team' | 'user';
  text: string;
};

const quickPrompts = [
  { label: 'I need help 🆘', mode: 'ai', text: 'I need help' },
  { label: 'I feel unsafe 😰', mode: 'ai', text: 'I feel unsafe' },
  { label: 'Safety tips 🛡️', mode: 'ai', text: 'Give me safety tips' },
  { label: 'Helplines 📞', mode: 'ai', text: 'Show me helplines' },
  { label: 'I am scared 🤖', mode: 'ai', text: 'I am scared' },
  { label: 'Talk to team 👩', mode: 'team', text: 'Talk to team' },
] as const;

function getAiReply(text: string) {
  const t = text.toLowerCase();

  // Check specific topics before the generic 'help' keyword.
  if (t.includes('helpline') || t.includes('help line') || t.includes('emergency number')) {
    return 'Police: 100   •   Women Helpline: 1091   •   Ambulance: 108';
  }
  if (t.includes('safety tip') || t.includes('safety tips')) {
    return 'Keep emergency contacts updated, share your location only when needed, and keep the Police 100 and Women Helpline 109 numbers accessible.';
  }
  if (t.includes('unsafe') || t.includes('scared') || t.includes('danger') || t.includes('help')) {
    return 'Your safety comes first. Move to a public or trusted place and use the SOS button when you need emergency assistance.';
  }
  return 'I am here with you. Tell me what happened, and I will guide you through the available safety options.';
}

export default function SupportScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [mode, setMode] = useState<Mode>('ai');
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      sender: 'ai',
      text: 'Hello! I am your WS App AI Support 💚 I am here to help you anytime. How are you feeling today?',
    },
    {
      id: 2,
      sender: 'ai',
      text: 'You can talk to me about anything — safety tips, emergency help, emotional support, or just to chat. I support Tamil & English! 🌸',
    },
  ]);

  const scrollRef = useRef<ScrollView>(null);

  const headerText = useMemo(
    () => (mode === 'ai' ? 'AI Support' : 'Team Support'),
    [mode]
  );

  const sendMessage = (text?: string, targetMode?: Mode) => {
    const value = (text ?? draft).trim();
    if (!value) return;

    const currentMode = targetMode ?? mode;
    setMode(currentMode);
    const nextId = Date.now();

    setMessages(prev => [
      ...prev,
      { id: nextId, sender: 'user', text: value },
      {
        id: nextId + 1,
        sender: currentMode === 'ai' ? 'ai' : 'team',
        text:
          currentMode === 'ai'
            ? getAiReply(value)
            : 'Your message has been added to Team Support. A support member can continue the conversation here.',
      },
    ]);
    setDraft('');

    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  };

  const openHelpline = () => {
    Linking.openURL('tel:1091').catch(() => {});
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.container}>
        <ScreenBackground opacity={0.18} mobileOpacity={0.1} desktopWidth="55%" />
        <View style={styles.overlay} />
        <StatusBar barStyle="light-content" backgroundColor="#1A0310" />

        <View style={[styles.topBar, isMobile && styles.topBarMobile]}>
          <TouchableOpacity onPress={() => router.replace('/')} activeOpacity={0.8}>
            <Text style={styles.backTxt}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.topTitle}>Safe Space</Text>
          <View style={styles.onlineDot} />
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.scroll, !isMobile && styles.scrollDesktop]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <Text style={styles.heroEye}>✦ 24/7 AI SUPPORT ✦</Text>
            <Text style={styles.heroTitle}>You Are{'\n'}Not Alone</Text>
            <Text style={styles.heroSub}>Smart AI — Tamil & English — always here</Text>
          </View>

          <View style={[styles.supportRow, isMobile && styles.supportRowMobile]}>
            <TouchableOpacity
              style={[styles.supportCard, mode === 'ai' && styles.supportCardActive]}
              onPress={() => setMode('ai')}
              activeOpacity={0.82}
            >
              <Text style={styles.supportIcon}>🤖</Text>
              <Text style={styles.supportTitle}>AI Support</Text>
              <Text style={styles.supportSub}>Always available</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.supportCard, mode === 'team' && styles.supportCardActive]}
              onPress={() => setMode('team')}
              activeOpacity={0.82}
            >
              <Text style={styles.supportIcon}>👩</Text>
              <Text style={styles.supportTitle}>Team Support</Text>
              <Text style={styles.supportSub}>5 min response</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.supportCard}
              onPress={openHelpline}
              activeOpacity={0.82}
            >
              <Text style={styles.supportIcon}>📞</Text>
              <Text style={styles.supportTitle}>Helpline</Text>
              <Text style={styles.supportSub}>Call 1091</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.chips}>
            {quickPrompts.map(item => (
              <TouchableOpacity
                key={item.label}
                style={[styles.chip, item.mode === mode && styles.chipActive]}
                onPress={() => sendMessage(item.text, item.mode)}
                activeOpacity={0.8}
              >
                <Text style={styles.chipText}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.modeBanner}>
            <Text style={styles.modeBannerText}>Current: {headerText}</Text>
            <Text style={styles.modeBannerHint}>
              {mode === 'ai'
                ? 'Instant guidance and safety information'
                : 'Support conversation mode'}
            </Text>
          </View>

          {messages.map(message => (
            <View
              key={message.id}
              style={[
                styles.messageRow,
                message.sender === 'user' && styles.messageRowUser,
              ]}
            >
              {message.sender !== 'user' && (
                <View style={styles.senderBadge}>
                  <Text style={styles.senderBadgeText}>
                    {message.sender === 'ai' ? 'AI' : 'TEAM'}
                  </Text>
                </View>
              )}

              <View
                style={[
                  styles.bubble,
                  message.sender === 'user' && styles.userBubble,
                ]}
              >
                <Text style={styles.bubbleText}>{message.text}</Text>
              </View>
            </View>
          ))}

          <View style={styles.helplineInfo}>
            <Text style={styles.helplineInfoIcon}>📞</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.helplineInfoTitle}>Emergency Women Helpline</Text>
              <Text style={styles.helplineInfoSub}>
                Tap to call 1091 directly in an emergency.
              </Text>
            </View>
            <TouchableOpacity style={styles.callBtn} onPress={openHelpline} activeOpacity={0.82}>
              <Text style={styles.callBtnText}>Call 1091</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <View style={styles.footerLine} />
            <Text style={styles.footerText}>Always With You</Text>
          </View>
        </ScrollView>

        <View style={styles.composerBar}>
          <TextInput
            style={[styles.input, { outlineStyle: 'none' } as any]}
            value={draft}
            onChangeText={setDraft}
            placeholder={mode === 'ai' ? 'Type your message here...' : 'Message Team Support...'}
            placeholderTextColor="rgba(255,255,255,0.28)"
            onSubmitEditing={() => sendMessage()}
            returnKeyType="send"
          />
          <TouchableOpacity
            style={styles.sendBtn}
            onPress={() => sendMessage()}
            activeOpacity={0.82}
          >
            <Text style={styles.sendTxt}>➤</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles: any = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1A0310' },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(26,3,16,0.72)',
  },
  topBar: {
    backgroundColor: 'rgba(20,2,12,0.92)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(201,168,76,0.22)',
    zIndex: 10,
  },
  topBarMobile: { paddingTop: 44 },
  backTxt: { color: '#C9A84C', fontSize: 13, fontWeight: '800' },
  topTitle: { color: '#fff', fontSize: 15, fontWeight: '900' },
  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4ade80',
  },
  scroll: {
    width: '100%',
    alignItems: 'center',
    paddingBottom: 100,
  },
  scrollDesktop: {
    paddingHorizontal: 24,
    maxWidth: 900,
    alignSelf: 'center',
    width: '100%',
  },
  hero: {
    width: '100%',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(201,168,76,0.16)',
  },
  heroEye: {
    color: 'rgba(201,168,76,0.68)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 10,
  },
  heroTitle: { color: '#fff', fontSize: 23, fontWeight: '900', lineHeight: 28 },
  heroSub: { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 8 },
  supportRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
    padding: 10,
  },
  supportRowMobile: { flexDirection: 'column' },
  supportCard: {
    flex: 1,
    minHeight: 82,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.22)',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  supportCardActive: {
    borderColor: '#C9A84C',
    backgroundColor: 'rgba(201,168,76,0.1)',
  },
  supportIcon: { fontSize: 22, marginBottom: 4 },
  supportTitle: { color: '#fff', fontSize: 13, fontWeight: '800' },
  supportSub: { color: 'rgba(255,255,255,0.32)', fontSize: 10, marginTop: 3 },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  chip: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.2)',
  },
  chipActive: { backgroundColor: 'rgba(201,168,76,0.12)' },
  chipText: { color: '#C9A84C', fontSize: 11, fontWeight: '700' },
  modeBanner: {
    width: '100%',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 2,
  },
  modeBannerText: { color: '#C9A84C', fontSize: 12, fontWeight: '800' },
  modeBannerHint: { color: 'rgba(255,255,255,0.3)', fontSize: 10, marginTop: 2 },
  messageRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  messageRowUser: { justifyContent: 'flex-end' },
  senderBadge: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C9A84C',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  senderBadgeText: { color: '#C9A84C', fontSize: 8, fontWeight: '900' },
  bubble: {
    maxWidth: '82%',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  userBubble: { backgroundColor: 'rgba(201,168,76,0.1)', borderColor: 'rgba(201,168,76,0.3)' },
  bubbleText: { color: 'rgba(255,255,255,0.8)', fontSize: 12, lineHeight: 18 },
  helplineInfo: {
    width: '100%',
    marginHorizontal: 10,
    marginTop: 6,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.22)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  helplineInfoIcon: { fontSize: 20 },
  helplineInfoTitle: { color: '#fff', fontSize: 12, fontWeight: '800' },
  helplineInfoSub: { color: 'rgba(255,255,255,0.32)', fontSize: 10, marginTop: 3 },
  callBtn: {
    backgroundColor: 'rgba(201,168,76,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.36)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  callBtnText: { color: '#C9A84C', fontSize: 11, fontWeight: '800' },
  footer: { width: '100%', alignItems: 'center', paddingVertical: 20 },
  footerLine: { width: 60, height: 1, backgroundColor: 'rgba(201,168,76,0.3)', marginBottom: 14 },
  footerText: {
    color: 'rgba(201,168,76,0.65)',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  composerBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 10,
    paddingBottom: Platform.OS === 'web' ? 10 : 18,
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'rgba(20,2,12,0.97)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(201,168,76,0.18)',
  },
  input: {
    flex: 1,
    minHeight: 42,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.28)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    color: '#fff',
    paddingHorizontal: 16,
    fontSize: 12,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: '#C9A84C',
    backgroundColor: 'rgba(201,168,76,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendTxt: { color: '#C9A84C', fontSize: 18, fontWeight: '900' },
});
