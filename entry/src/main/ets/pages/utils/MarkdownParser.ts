export type MdNode =
  | { type: 'heading'; level: number; text: string }
    | { type: 'paragraph'; text: string }
    | { type: 'code'; text: string };

export function parseMarkdown(md: string): MdNode[] {
  const lines = md.split('\n');
  const nodes: MdNode[] = [];
  let inCode = false;
  let codeBuffer: string[] = [];

  lines.forEach(line => {
    if (line.startsWith('```')) {
      inCode = !inCode;
      if (!inCode) {
        nodes.push({ type: 'code', text: codeBuffer.join('\n') });
        codeBuffer = [];
      }
      return;
    }

    if (inCode) {
      codeBuffer.push(line);
      return;
    }

    if (line.startsWith('#')) {
      const level = line.match(/^#+/)?.[0].length || 1;
      nodes.push({
        type: 'heading',
        level,
        text: line.replace(/^#+\s*/, '')
      });
    } else if (line.trim()) {
      nodes.push({ type: 'paragraph', text: line });
    }
  });

  return nodes;
}
