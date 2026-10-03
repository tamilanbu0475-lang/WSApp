import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Linking, Platform, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';

type Topic = { id: string; icon: string; group: string; title: string; src: string; url?: string; points: string[] };

const IC = 'India Code (Government of India)';
const MWCD = 'Ministry of Women & Child Development (MWCD)';
const MHA = 'Ministry of Home Affairs / I4C';

const TOPICS: Topic[] = [
  // ================= RIGHTS & CRIMINAL LAW =================
  { id: 'const', icon: '⚖️', group: 'Constitution & Criminal Law', title: 'Constitutional equality & non-discrimination', src: 'Constitution of India - ' + IC, url: 'https://www.indiacode.nic.in',
    points: ['Article 14: equality before law for all persons.', 'Article 15: no discrimination on grounds of sex, and Article 15(3) allows the State to make special provisions for women and children.', 'Article 16: equal opportunity in public employment.', 'Article 21: protection of life, personal liberty and dignity.', 'Article 39(d) (a guiding principle for the State): equal pay for equal work for men and women.'] },
  { id: 'bns', icon: '📜', group: 'Constitution & Criminal Law', title: 'Bharatiya Nyaya Sanhita, 2023 (BNS)', src: IC, url: 'https://www.indiacode.nic.in',
    points: ['BNS replaced the Indian Penal Code, 1860, and came into force on 1 July 2024.', 'Offences against women and children are in Chapter V (sections 63 to 99).', 'Police and court procedure is now under the Bharatiya Nagarik Suraksha Sanhita, 2023 (BNSS), which replaced the CrPC.', 'Old FIRs and cases from before 1 July 2024 are still dealt with under the old law.'] },
  { id: 'zerofir', icon: '📝', group: 'Constitution & Criminal Law', title: 'Zero FIR & your right to file a complaint', src: 'Bharatiya Nagarik Suraksha Sanhita, 2023 - ' + IC, url: 'https://www.indiacode.nic.in',
    points: ['For a cognizable offence you can give information at any police station, even if the incident happened elsewhere. This is called a Zero FIR; it is registered and then transferred to the police station that has jurisdiction.', 'Information can be given orally or by electronic communication (an e-complaint must be signed by you within 3 days).', 'You must be given a free copy of the FIR.', 'For offences like rape, the information should be recorded by a woman police officer, and the victim can give it at her residence or a place of her choice.', 'If the police refuse to register it, you can send the information in writing to the Superintendent of Police, or approach a Magistrate.'] },
  { id: 'rape', icon: '🛡️', group: 'Constitution & Criminal Law', title: 'Rape & other sexual offences', src: 'Bharatiya Nyaya Sanhita, 2023 - ' + IC, url: 'https://www.indiacode.nic.in',
    points: ['Rape is defined in section 63 and punished under section 64 (minimum 10 years, up to life imprisonment, and fine).', 'Sections 65, 66 and 70 provide stricter punishment for rape of girls below 16 or 12, rape causing death or a persistent vegetative state, and gang rape.', 'Section 69 punishes sexual intercourse by deceitful means or by a false promise of marriage.', 'Medical examination is done only with the victim\'s consent by a registered doctor, preferably a woman.', 'Hospitals (public and private) must give free first-aid or treatment to victims of rape and acid attack, and inform the police.', 'Safety advice: if you can, do not wash or change clothes before the medical examination, so that evidence is preserved.'] },
  { id: 'harass', icon: '🚫', group: 'Constitution & Criminal Law', title: 'Sexual harassment', src: 'Bharatiya Nyaya Sanhita, 2023 (section 75) - ' + IC, url: 'https://www.indiacode.nic.in',
    points: ['Section 75 covers unwelcome physical contact and advances, a demand or request for sexual favours, showing pornography against a woman\'s will, and making sexual remarks.', 'The first three are punishable with up to 3 years\' imprisonment and/or fine; sexual remarks with up to 1 year and/or fine.', 'Section 74 punishes assault or criminal force to a woman with intent to outrage her modesty, and section 79 punishes words, gestures or acts intended to insult her modesty.'] },
  { id: 'stalk', icon: '👣', group: 'Constitution & Criminal Law', title: 'Stalking', src: 'Bharatiya Nyaya Sanhita, 2023 (section 78) - ' + IC, url: 'https://www.indiacode.nic.in',
    points: ['Following a woman and contacting, or trying to contact, her despite her clear sign of disinterest is stalking.', 'Monitoring her use of the internet, email or any electronic communication is also stalking.', 'Punishment: up to 3 years on first conviction and up to 5 years on a later conviction, plus fine.', 'Keep screenshots, call logs and dates as evidence.'] },
  { id: 'voy', icon: '📵', group: 'Constitution & Criminal Law', title: 'Voyeurism', src: 'Bharatiya Nyaya Sanhita, 2023 (section 77) - ' + IC, url: 'https://www.indiacode.nic.in',
    points: ['Watching or capturing an image of a woman in a private act, when she expects not to be observed, is an offence.', 'Sharing such an image without her consent is also an offence, even if she had agreed to the image being taken.', 'Punishment: 1 to 3 years on first conviction and 3 to 7 years on a later conviction, plus fine.'] },
  { id: 'disrobe', icon: '🙅‍♀️', group: 'Constitution & Criminal Law', title: 'Assault or force to disrobe a woman', src: 'Bharatiya Nyaya Sanhita, 2023 (section 76) - ' + IC, url: 'https://www.indiacode.nic.in',
    points: ['Using assault or criminal force on a woman intending to disrobe her, or compelling her to be naked, is an offence.', 'Punishment: 3 to 7 years\' imprisonment and fine.'] },
  { id: 'acid', icon: '🧪', group: 'Constitution & Criminal Law', title: 'Acid attack', src: 'Bharatiya Nyaya Sanhita, 2023 (section 124) - ' + IC, url: 'https://www.indiacode.nic.in',
    points: ['Causing grievous hurt by acid: not less than 10 years, up to life imprisonment, and a fine that must be reasonable to meet medical expenses.', 'Throwing or attempting to throw acid: 5 to 7 years and fine.', 'All hospitals must provide free first-aid or treatment to acid-attack victims.', 'Call 112 and rinse the affected area with plenty of clean water while waiting for medical help.'] },
  { id: 'identity', icon: '🔒', group: 'Constitution & Criminal Law', title: 'Victim identity protection', src: 'BNS 2023 (section 72) and BNSS 2023 - ' + IC, url: 'https://www.indiacode.nic.in',
    points: ['Printing or publishing the name or any detail that identifies a victim of rape or similar sexual offences is punishable (up to 2 years and fine), with limited exceptions such as written authorisation of the victim.', 'Trials of such offences are held in camera (privately).', 'You can ask the police and the court to keep your identity confidential.'] },
  { id: 'arrest', icon: '👮‍♀️', group: 'Constitution & Criminal Law', title: 'Rights of women during police procedure', src: 'Bharatiya Nagarik Suraksha Sanhita, 2023 - ' + IC, url: 'https://www.indiacode.nic.in',
    points: ['A woman should not be arrested after sunset and before sunrise, except in exceptional circumstances where a woman police officer gets prior written permission of a Magistrate.', 'A male police officer should not touch a woman to arrest her unless the situation requires it; she can submit to arrest on oral intimation.', 'A search of a woman must be done only by another woman, with strict regard to decency.', 'A woman cannot be required to attend a police station for questioning; the police should question her at her place of residence.', 'An arrested person must be told the grounds of arrest, can have a relative or friend informed, and can consult a lawyer or get free legal aid.'] },
  { id: 'maint', icon: '💰', group: 'Constitution & Criminal Law', title: 'Maintenance for wives, children & parents', src: 'Bharatiya Nagarik Suraksha Sanhita, 2023 (section 144) - ' + IC, url: 'https://www.indiacode.nic.in',
    points: ['A wife who cannot maintain herself can seek monthly maintenance from her husband through a Magistrate, whatever her religion.', 'The same remedy exists for minor children and parents who cannot maintain themselves.', 'A wife living separately without sufficient reason, or living in adultery, may lose this right.'] },
  { id: 'comp', icon: '🤝', group: 'Constitution & Criminal Law', title: 'Victim compensation', src: 'BNSS 2023 (section 396) - ' + IC, url: 'https://www.indiacode.nic.in',
    points: ['Every State must have a Victim Compensation Scheme for victims who suffer loss or injury and need rehabilitation.', 'The court can recommend compensation, and the District Legal Services Authority decides the amount.', 'Compensation is separate from any fine the accused pays; details differ from State to State.'] },

  // ================= HOME, WORK & FAMILY =================
  { id: 'dv', icon: '🏠', group: 'Home, Work & Family', title: 'Protection of Women from Domestic Violence Act, 2005', src: MWCD + ' / ' + IC, url: 'https://wcd.gov.in',
    points: ['Protects women in a domestic relationship (marriage, live-in or family) from physical, sexual, verbal, emotional and economic abuse, including harassment for dowry.', 'A Magistrate can pass protection orders, residence orders, monetary relief, custody orders and compensation orders.', 'You have a right to reside in the shared household and cannot be thrown out except by due process of law.', 'Approach a Protection Officer, a service provider, the police, a One Stop Centre, or call 181.', 'This Act gives civil remedies. A criminal complaint (for example for cruelty under BNS section 85) can be filed separately.'] },
  { id: 'dowry', icon: '💍', group: 'Home, Work & Family', title: 'Dowry Prohibition Act, 1961', src: IC + ' / ' + MWCD, url: 'https://www.indiacode.nic.in',
    points: ['Giving, taking or helping in giving or taking dowry: at least 5 years\' imprisonment and fine of at least Rs 15,000 or the value of the dowry, whichever is more.', 'Demanding dowry: 6 months to 2 years and fine up to Rs 10,000.', 'Dowry belongs to the woman, and must be handed over to her.', 'Dowry death (BNS section 80) is a serious offence when a woman dies unnaturally within 7 years of marriage after cruelty or harassment for dowry; minimum 7 years up to life imprisonment.', 'Cruelty by husband or his relatives is punishable under BNS section 85.'] },
  { id: 'posh', icon: '🏢', group: 'Home, Work & Family', title: 'POSH Act, 2013 (workplace sexual harassment)', src: MWCD + ' / ' + IC, url: 'https://wcd.gov.in',
    points: ['Protects women at any workplace: government, private, and unorganised sector, including domestic workers.', 'Every office or branch with 10 or more employees must have an Internal Committee (IC). For smaller workplaces, or where the complaint is against the employer, the District Local Committee handles it.', 'Complaint should be in writing within 3 months of the incident (extendable by up to 3 months for valid reasons). The committee must help if you cannot write.', 'Inquiry should be completed within 90 days. You may ask for interim relief such as a transfer or leave.', 'Conciliation can be tried only if you request it, and money cannot be the basis of settlement.', 'Proceedings are confidential; publishing the complainant\'s identity is prohibited.'] },
  { id: 'maternity', icon: '🤱', group: 'Home, Work & Family', title: 'Maternity benefits (now under Code on Social Security, 2020)', src: IC + ' / Ministry of Labour & Employment', url: 'https://www.indiacode.nic.in',
    points: ['The Maternity Benefit Act, 1961 was repealed when the Labour Codes came into force on 21 November 2025. Maternity benefit is now provided under the Code on Social Security, 2020.', 'Paid maternity leave: 26 weeks for the first two children and 12 weeks from the third child. Women usually need to have worked at least 80 days in the 12 months before delivery.', 'Establishments with 50 or more employees must provide a crèche facility.', 'An employer cannot dismiss a woman because she is on maternity leave.', 'Exact eligibility and procedure are set in the Code and its rules, so check with your employer or the Labour Department.'] },
  { id: 'wage', icon: '💼', group: 'Home, Work & Family', title: 'Equal pay & non-discrimination at work (Code on Wages, 2019)', src: IC + ' / Ministry of Labour & Employment', url: 'https://www.indiacode.nic.in',
    points: ['The Equal Remuneration Act, 1976 has been replaced by the Code on Wages, 2019 (in force from 21 November 2025).', 'An employer cannot discriminate on grounds of gender in wages for the same work or work of a similar nature.', 'There must also be no gender discrimination in recruitment and conditions of service, except where the law restricts women\'s employment.', 'Complaints can be made to the Labour Department / inspector-cum-facilitator under the Code.'] },
  { id: 'muslim', icon: '🕌', group: 'Home, Work & Family', title: 'Muslim women\'s rights (marriage & divorce)', src: IC, url: 'https://www.indiacode.nic.in',
    points: ['Muslim Women (Protection of Rights on Marriage) Act, 2019: instant triple talaq (talaq-e-biddat) is void and illegal, and punishable with up to 3 years\' imprisonment and fine.', 'A married Muslim woman is entitled to a subsistence allowance and to custody of her minor children, as decided by a Magistrate.', 'Muslim Women (Protection of Rights on Divorce) Act, 1986: a divorced Muslim woman can claim a fair provision, maintenance and mahr.', 'Muslim women can also use the Domestic Violence Act, 2005 and maintenance under BNSS section 144.'] },
  { id: 'sati', icon: '🕊️', group: 'Home, Work & Family', title: 'Commission of Sati (Prevention) Act, 1987', src: IC, url: 'https://www.indiacode.nic.in',
    points: ['Sati and its abetment are prohibited; abetment of sati is punishable with death or life imprisonment.', 'Glorifying sati is also a punishable offence.'] },

  { id: 'hsa', icon: '🏡', group: 'Home, Work & Family', title: 'Hindu Succession Act, 1956 (daughters\' property rights)', src: IC, url: 'https://www.indiacode.nic.in',
    points: ['Since the 2005 amendment, a daughter has the same rights as a son in ancestral Hindu joint family property, by birth.', 'She has equal rights as a coparcener, with the same liabilities as a son.', 'The Supreme Court (Vineeta Sharma v. Rakesh Sharma, 2020) held that this right does not depend on whether the father was alive on 9 September 2005.', 'This Act applies to Hindus, Buddhists, Jains and Sikhs. Other communities are governed by their own personal laws.'] },

  // ================= CYBER =================
  { id: 'cyber', icon: '💻', group: 'Cyber Safety', title: 'Cyber crime & online abuse', src: 'IT Act, 2000 and BNS 2023 - ' + IC, url: 'https://www.indiacode.nic.in',
    points: ['Sharing private images without consent (IT Act section 66E), publishing obscene or sexually explicit material (sections 67, 67A), identity theft and impersonation online (sections 66C, 66D) are punishable.', 'Online stalking, voyeurism and threats are also covered under BNS sections 77, 78 and 351.', 'Do not delete evidence. Take screenshots showing date, time and profile link.', 'Report on the National Cyber Crime Reporting Portal (cybercrime.gov.in, Ministry of Home Affairs / I4C). For some women and child related categories you can report without revealing your identity.', 'Lost money to online fraud? Call 1930 immediately, then complain on the portal. Also ask the platform to remove the content.'] },

  // ================= CHILDREN & HEALTH =================
  { id: 'pocso', icon: '🧒', group: 'Children & Health', title: 'POCSO Act, 2012', src: MWCD + ' / ' + IC, url: 'https://www.indiacode.nic.in',
    points: ['Protects every person below 18 years, girl or boy, from sexual assault, sexual harassment and child pornography.', 'Any person who knows of such an offence must report it to the police or Special Juvenile Police Unit; not reporting is itself punishable.', 'The child\'s statement is recorded at home or a place of the child\'s choice, by a woman officer not in uniform.', 'Trials are held in special courts, in camera, and the child\'s identity must be protected.', 'Child Helpline: 1098.'] },
  { id: 'cm', icon: '👧', group: 'Children & Health', title: 'Prohibition of Child Marriage Act, 2006', src: IC + ' / ' + MWCD, url: 'https://www.indiacode.nic.in',
    points: ['Legal minimum age of marriage: 18 years for women and 21 years for men.', 'A child marriage is voidable: the person who was a child can ask the District Court to annul it, up to 2 years after becoming an adult.', 'An adult man marrying a girl below 18, and those who arrange or perform the marriage, can be punished (up to 2 years\' imprisonment and/or fine up to Rs 1 lakh).', 'The offence is cognizable and non-bailable.', 'Report to the Child Marriage Prohibition Officer, the police or Childline 1098.'] },
  { id: 'mtp', icon: '🩺', group: 'Children & Health', title: 'Medical Termination of Pregnancy (MTP) Act, 1971 (amended 2021)', src: 'Ministry of Health & Family Welfare / ' + IC, url: 'https://www.indiacode.nic.in',
    points: ['Allows safe and legal abortion by a registered medical practitioner at an approved facility.', 'Up to 20 weeks: opinion of one doctor. 20 to 24 weeks: opinion of two doctors for special categories (such as survivors of rape or incest, minors, change of marital status, disabled women).', 'Beyond 24 weeks: only for substantial foetal abnormalities, decided by a State Medical Board. In an emergency to save the woman\'s life, the time limit does not apply.', 'The woman\'s consent is required (guardian\'s consent for a minor), and her identity must be kept confidential.'] },
  { id: 'pcpndt', icon: '👶', group: 'Children & Health', title: 'PCPNDT Act, 1994', src: 'Ministry of Health & Family Welfare / ' + IC, url: 'https://www.indiacode.nic.in',
    points: ['Full name: Pre-Conception and Pre-Natal Diagnostic Techniques (Prohibition of Sex Selection) Act.', 'Sex selection, and telling the sex of a foetus, are prohibited. Diagnostic centres must be registered.', 'Doctors, centres and those who force a woman can be punished (first offence up to 3 years and fine; repeat offence up to 5 years).', 'The court presumes a woman was compelled by her husband or relatives unless proved otherwise.', 'Complaints go to the District Appropriate Authority.'] },

  // ================= EXPLOITATION =================
  { id: 'irwa', icon: '📢', group: 'Exploitation & Dignity', title: 'Indecent Representation of Women (Prohibition) Act, 1986', src: IC, url: 'https://www.indiacode.nic.in',
    points: ['Prohibits indecent or derogatory depiction of women in advertisements, books, pamphlets, writings, paintings and figures.', 'Offenders can be punished with imprisonment and fine.', 'Online content is mainly dealt with under the IT Act, 2000.'] },
  { id: 'traffic', icon: '⛓️', group: 'Exploitation & Dignity', title: 'Trafficking & exploitation', src: 'BNS 2023 (sections 143, 144) and Immoral Traffic (Prevention) Act, 1956 - ' + IC, url: 'https://www.indiacode.nic.in',
    points: ['Trafficking of a person for exploitation is a serious offence under BNS section 143 (section 144 covers exploitation of a trafficked person).', 'The Immoral Traffic (Prevention) Act, 1956 provides for rescue and protective homes.', 'Report to the police (112), Women Helpline 181 or a One Stop Centre.', 'Rescued women can be supported in a Shakti Sadan.'] },

  // ================= HELP & SERVICES =================
  { id: 'nalsa', icon: '🧑‍⚖️', group: 'Legal Aid & Commission', title: 'Legal Services Authorities Act, 1987 (free legal aid)', src: 'NALSA / '+IC, url: 'https://nalsa.gov.in',
    points: ['Under the Legal Services Authorities Act, 1987, every woman is entitled to free legal services, whatever her income.', 'Services include a lawyer, payment of court fees and legal advice.', 'Contact your District or State Legal Services Authority, or call the NALSA helpline 15100.'] },
  { id: 'ncw', icon: '🏛️', group: 'Legal Aid & Commission', title: 'National Commission for Women Act, 1990', src: 'National Commission for Women (NCW) / '+IC, url: 'https://ncw.gov.in',
    points: ['Statutory body set up under the National Commission for Women Act, 1990.', 'It examines safeguards for women, advises the Government and can take up complaints, including suo motu.', 'You can file a complaint in writing or online. NCW can call for reports and ask the police to act, but it does not itself prosecute.', 'It does not replace the police or the courts, so file an FIR where a crime has happened.'] },
  { id: 'ncrp', icon: '🌐', group: 'Help, Services & Helplines', title: 'National Cyber Crime Reporting Portal', src: MHA, url: 'https://cybercrime.gov.in',
    points: ['Official Government of India portal to report cyber crimes, with special attention to crimes against women and children.', 'For certain categories of women and child related crime, the portal gives an option to report without revealing your identity.', 'Keep your acknowledgement number to track the complaint.'] },
  { id: '1930', icon: '💳', group: 'Help, Services & Helplines', title: 'Cyber financial fraud helpline 1930', src: MHA, url: 'https://cybercrime.gov.in',
    points: ['Call 1930 immediately if you lose money to online fraud. Fast reporting improves the chance of blocking the money.', 'After calling, also file the complaint on cybercrime.gov.in.', 'Never share your OTP, PIN or card details with anyone.'] },
  { id: 'osc', icon: '🏥', group: 'Help, Services & Helplines', title: 'One Stop Centres (Sakhi)', src: MWCD + ' (Mission Shakti)', url: 'https://wcd.gov.in',
    points: ['Give integrated support under one roof to women affected by violence: medical aid, police facilitation, legal aid, counselling and temporary shelter.', 'Open to women irrespective of age, caste, class or religion.', 'Reach one through Women Helpline 181.'] },
  { id: '181', icon: '📞', group: 'Help, Services & Helplines', title: 'Women Helpline 181', src: MWCD + ' (Mission Shakti)', url: 'https://wcd.gov.in',
    points: ['Toll-free 24-hour helpline for women affected by violence.', 'Gives information and links you to the police, hospitals and One Stop Centres.', 'If you cannot get through, or it is an emergency, call 112.'] },
  { id: '112', icon: '🚨', group: 'Help, Services & Helplines', title: 'Emergency Response Support System - 112', src: 'ERSS 112, Government of India', url: 'https://112.gov.in',
    points: ['Single emergency number across India for police, fire and ambulance.', 'Call 112 first when you are in immediate danger.', 'The official 112 India mobile app also has an SOS feature.'] },
  { id: 'shebox', icon: '📥', group: 'Help, Services & Helplines', title: 'SHe-Box portal', src: MWCD, url: 'https://shebox.wcd.gov.in',
    points: ['Online portal to register complaints of sexual harassment at the workplace.', 'The complaint is forwarded to the concerned Internal / Local Committee for action under the POSH Act.', 'Women working in government or private organisations can use it.'] },
  { id: 'shakti', icon: '🏘️', group: 'Help, Services & Helplines', title: 'Shakti Sadan', src: MWCD + ' (Mission Shakti - Samarthya)', url: 'https://wcd.gov.in',
    points: ['Integrated relief and rehabilitation homes for women in distress, including trafficked women.', 'Provide shelter, food, clothing, counselling and help with legal support and rehabilitation.', 'It brought together the earlier Swadhar Greh and Ujjawala schemes.'] },
  { id: '1098', icon: '🧸', group: 'Help, Services & Helplines', title: 'Child Helpline 1098', src: MWCD, url: 'https://wcd.gov.in',
    points: ['24-hour free helpline for children in need of care and protection.', 'Anyone can call for a child facing abuse, child marriage, child labour or neglect.'] },
  { id: 'mshakti', icon: '🌟', group: 'Help, Services & Helplines', title: 'Mission Shakti', src: MWCD, url: 'https://wcd.gov.in',
    points: ['Umbrella scheme of the Ministry of Women & Child Development for women\'s safety, security and empowerment (from 1 April 2022).', 'Sambal (safety and security): One Stop Centres, Women Helpline 181, Beti Bachao Beti Padhao and Nari Adalats.', 'Samarthya (empowerment): Shakti Sadan, Sakhi Niwas (working women hostels), Palna (creches), PMMVY and economic empowerment support.'] },
  { id: 'evidence', icon: '📸', group: 'Help, Services & Helplines', title: 'Safe evidence & reporting awareness', src: 'General safety guidance (see ' + MHA + ' and BNSS)', url: 'https://cybercrime.gov.in',
    points: ['Save messages, call logs, photos, emails and screenshots. Do not delete them.', 'Note the date, time, place and names of any witnesses.', 'After a sexual assault, seek a medical examination as early as possible.', 'Tell a trusted person and use the WS App SOS button when you are in danger.', 'You can file a Zero FIR at any police station. If it is refused, write to the Superintendent of Police or approach a Magistrate.'] },
];

const GROUPS = Array.from(new Set(TOPICS.map(t => t.group)));

export default function SafetyInfo() {
  const router = useRouter();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setOpen((p: Record<string, boolean>) => ({ ...p, [id]: !p[id] }));
  const goBack = () => { if (router.canGoBack()) router.back(); else router.replace('/'); };

  return (
    <View style={s.screen}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.wrap}>
          <TouchableOpacity onPress={goBack} style={s.backBtn}><Text style={s.backTxt}>‹ Back</Text></TouchableOpacity>
          <Text style={s.title}>Safety Information</Text>
          <Text style={s.sub}>Major Women Safety Laws, Rights & Government Support Services in India</Text>
          <Text style={s.hint}>Laws, rights and support services for women. Tap + to read here, − to close.</Text>

          <View style={s.note}>
            <Text style={s.noteTxt}>
              This page summarises major central laws, rights and support services for women, from official Government of India sources. It is not a list of every law in India, and it is general information, not legal advice. Exact remedies depend on your case and on Central and State procedures, and laws can be amended. For advice, contact a lawyer or your District Legal Services Authority (NALSA 15100).
            </Text>
          </View>

          {GROUPS.map(g => (
            <View key={g}>
              <Text style={s.group}>{g}</Text>
              {TOPICS.filter(t => t.group === g).map(t => {
                const isOpen = !!open[t.id];
                return (
                  <View key={t.id} style={s.card}>
                    <TouchableOpacity style={s.cardHead} onPress={() => toggle(t.id)} activeOpacity={0.8}>
                      <View style={s.ico}><Text style={s.icoTxt}>{t.icon}</Text></View>
                      <Text style={s.cardTitle}>{t.title}</Text>
                      <View style={s.plus}><Text style={s.plusTxt}>{isOpen ? '−' : '+'}</Text></View>
                    </TouchableOpacity>
                    {isOpen && (
                      <View style={s.body}>
                        {t.points.map((p, i) => (
                          <View key={i} style={s.pRow}>
                            <Text style={s.dot}>•</Text>
                            <Text style={s.pTxt}>{p}</Text>
                          </View>
                        ))}
                        <Text style={s.src}>Official source: {t.src}</Text>
                        {t.url ? (
                          <TouchableOpacity onPress={() => Linking.openURL(t.url!)} style={s.linkBtn}>
                            <Text style={s.linkTxt}>Optional: official website ↗</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          ))}

          <Text style={s.foot}>In immediate danger? Call 112. Women Helpline: 181. Child Helpline: 1098. Cyber fraud: 1930. Legal aid: 15100.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#1A0310', ...(Platform.OS === 'web' ? ({ height: '100vh' } as any) : {}) },
  scroll: { paddingBottom: 60, paddingTop: Platform.OS === 'android' ? 40 : 50 },
  wrap: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 16 },
  backBtn: { paddingVertical: 8, paddingRight: 16, alignSelf: 'flex-start' },
  backTxt: { color: '#C9A84C', fontSize: 16, fontWeight: '700' },
  title: { color: '#C9A84C', fontSize: 28, fontWeight: '800', marginTop: 4 },
  sub: { color: '#F3E7D3', fontSize: 15, fontWeight: '600', marginTop: 4 },
  hint: { color: '#E8D9C0', fontSize: 13, marginTop: 4, marginBottom: 12 },
  note: { backgroundColor: '#5C0A2D', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#C9A84C55', marginBottom: 8 },
  noteTxt: { color: '#F3E7D3', fontSize: 12.5, lineHeight: 18 },
  group: { color: '#C9A84C', fontSize: 14, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginTop: 20, marginBottom: 8 },
  card: { backgroundColor: '#2A0818', borderRadius: 14, borderWidth: 1, borderColor: '#C9A84C44', marginBottom: 10, overflow: 'hidden' },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  ico: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#5C0A2D', borderWidth: 1, borderColor: '#C9A84C', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  icoTxt: { fontSize: 21 },
  cardTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', flex: 1, paddingRight: 10 },
  plus: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#0B6E4F', alignItems: 'center', justifyContent: 'center' },
  plusTxt: { color: '#fff', fontSize: 20, fontWeight: '700', lineHeight: 22 },
  body: { paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: '#C9A84C22' },
  pRow: { flexDirection: 'row', marginTop: 8 },
  dot: { color: '#C9A84C', marginRight: 8, fontSize: 15 },
  pTxt: { color: '#EBDDC8', fontSize: 14, lineHeight: 20, flex: 1 },
  src: { color: '#C9A84C', fontSize: 12, marginTop: 12, fontStyle: 'italic' },
  linkBtn: { marginTop: 8, alignSelf: 'flex-start' },
  linkTxt: { color: '#5FD4A5', fontSize: 12.5, textDecorationLine: 'underline' },
  foot: { color: '#E8D9C0', textAlign: 'center', fontSize: 12.5, marginTop: 24, lineHeight: 18 },
});
