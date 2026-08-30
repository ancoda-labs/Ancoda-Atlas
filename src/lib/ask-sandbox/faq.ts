export const FAQ_CHIPS = [
  { id: 'deaths', en: 'How many died?', ne: 'कति जनाको मृत्यु भयो?' },
  { id: 'worst', en: 'Which districts were worst hit?', ne: 'कुन जिल्लामा सबैभन्दा बढी क्षति भयो?' },
  { id: 'betrawati', en: 'What about Betrawati?', ne: 'बेत्रावतीको अवस्था के छ?' },
  { id: 'uncontacted', en: 'Where are people still uncontacted?', ne: 'सम्पर्कविहीन कहाँ छन्?' },
  { id: 'donate', en: 'How can I give safely?', ne: 'सुरक्षित रूपमा कसरी सहयोग गर्ने?' },
  { id: 'rescue', en: 'Is my relative on the rescued list?', ne: 'मेरो आफन्त उद्धार सूचीमा छ कि?' },
] as const;

export function faqBlurb(lang: 'en' | 'ne'): string {
  return lang === 'ne'
    ? 'यो परीक्षण हो, सार्वजनिक डेस्क होइन। जवाफ यही डेस्कमा रहेको तथ्यांकबाट मात्र आउँछ। नाम खोज्न उद्धार पृष्ठ प्रयोग गर्नुहोस्।'
    : 'This is a sandbox, not the public desk. Answers can only repeat what is already on this desk. Name search stays on the rescue page.';
}
