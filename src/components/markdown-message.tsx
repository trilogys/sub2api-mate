import { Linking, Pressable, View } from 'react-native';
import { Text } from '@/src/components/localized-text';

function Inline({ text, color }: { text: string; color: string }) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).filter(Boolean);
  return <Text selectable style={{ color, fontSize: 13, lineHeight: 20 }}>{parts.map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) return <Text key={index} style={{ fontFamily: 'monospace', backgroundColor: '#DDE7F5' }}>{part.slice(1,-1)}</Text>;
    if (part.startsWith('**') && part.endsWith('**')) return <Text key={index} style={{ fontWeight: '800' }}>{part.slice(2,-2)}</Text>;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/); if (link) return <Text key={index} onPress={() => Linking.openURL(link[2])} style={{ color: '#2F6DF6', textDecorationLine: 'underline' }}>{link[1]}</Text>;
    return <Text key={index}>{part}</Text>;
  })}</Text>;
}

export function MarkdownMessage({ text, inverted = false }: { text: string; inverted?: boolean }) {
  const color = inverted ? '#FFFFFF' : '#27364F'; const lines = text.replace(/\r/g, '').split('\n'); const nodes: React.ReactNode[] = []; let code: string[] = [];
  const flush = () => { if (!code.length) return; nodes.push(<View key={`code-${nodes.length}`} style={{ marginVertical: 5, borderRadius: 10, backgroundColor: inverted ? 'rgba(0,0,0,.18)' : '#182235', padding: 10 }}><Text selectable style={{ color: '#E8EEF8', fontFamily: 'monospace', fontSize: 11, lineHeight: 17 }}>{code.join('\n')}</Text></View>); code = []; };
  let fenced = false;
  lines.forEach((line, index) => { if (line.trim().startsWith('```')) { if (fenced) flush(); fenced = !fenced; return; } if (fenced) { code.push(line); return; } const heading = line.match(/^(#{1,3})\s+(.+)/); const bullet = line.match(/^\s*[-*]\s+(.+)/); const numbered = line.match(/^\s*(\d+)\.\s+(.+)/); const quote = line.match(/^>\s?(.+)/); if (heading) nodes.push(<Text key={index} selectable style={{ color, fontSize: heading[1].length === 1 ? 17 : 15, fontWeight: '800', marginTop: 5, marginBottom: 2 }}>{heading[2]}</Text>); else if (bullet) nodes.push(<View key={index} style={{ flexDirection: 'row', gap: 7, marginVertical: 1 }}><Text style={{ color }}>•</Text><View style={{ flex: 1 }}><Inline text={bullet[1]} color={color} /></View></View>); else if (numbered) nodes.push(<View key={index} style={{ flexDirection: 'row', gap: 7, marginVertical: 1 }}><Text style={{ color }}>{numbered[1]}.</Text><View style={{ flex: 1 }}><Inline text={numbered[2]} color={color} /></View></View>); else if (quote) nodes.push(<View key={index} style={{ borderLeftWidth: 3, borderLeftColor: '#8FB2F8', paddingLeft: 9, marginVertical: 3 }}><Inline text={quote[1]} color={color} /></View>); else if (!line.trim()) nodes.push(<View key={index} style={{ height: 7 }} />); else nodes.push(<Inline key={index} text={line} color={color} />); }); flush(); return <View style={{ gap: 1 }}>{nodes}</View>;
}
