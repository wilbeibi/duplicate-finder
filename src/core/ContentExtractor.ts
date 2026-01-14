export class ContentExtractor {
  extract(raw: string): string {
    let content = raw;
    
    content = this.removeFrontmatter(content);
    content = this.normalizeWhitespace(content);
    
    return content;
  }

  countLines(content: string): number {
    if (content.length === 0) return 0;
    return content.split('\n').length;
  }

  private removeFrontmatter(content: string): string {
    const frontmatterRegex = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
    return content.replace(frontmatterRegex, '');
  }

  private normalizeWhitespace(content: string): string {
    return content
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}