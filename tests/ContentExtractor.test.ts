import { describe, it, expect } from 'vitest';
import { ContentExtractor } from '../src/core/ContentExtractor';

describe('ContentExtractor', () => {
  const extractor = new ContentExtractor();
  
  describe('extract', () => {
    it('removes YAML frontmatter', () => {
      const content = `---
title: Test
tags: [test]
---

This is the content.`;
      
      expect(extractor.extract(content)).toBe('This is the content.');
    });
    
    it('handles content without frontmatter', () => {
      const content = 'Just plain content.';
      expect(extractor.extract(content)).toBe('Just plain content.');
    });
    
    it('normalizes line endings', () => {
      const content = 'Line 1\r\nLine 2\rLine 3\nLine 4';
      const result = extractor.extract(content);
      
      expect(result).not.toContain('\r');
      expect(result.split('\n').length).toBe(4);
    });
    
    it('collapses multiple blank lines', () => {
      const content = 'Para 1\n\n\n\nPara 2';
      expect(extractor.extract(content)).toBe('Para 1\n\nPara 2');
    });
    
    it('trims whitespace', () => {
      const content = '  \n  Content  \n  ';
      expect(extractor.extract(content)).toBe('Content');
    });

    it('removes frontmatter with CRLF line endings', () => {
      expect(extractor.extract('---\r\ntitle: Test\r\n---\r\nBody')).toBe('Body');
    });

    it('keeps a horizontal rule in the middle of a note', () => {
      const content = 'Intro\n\n---\n\nMore\n\n---\n\nEnd';
      expect(extractor.extract(content)).toBe(content);
    });

    it('returns empty text for a note that is only frontmatter', () => {
      expect(extractor.extract('---\ntitle: Test\n---\n')).toBe('');
    });
  });

  describe('countLines', () => {
    it('counts lines correctly', () => {
      expect(extractor.countLines('')).toBe(0);
      expect(extractor.countLines('single line')).toBe(1);
      expect(extractor.countLines('line 1\nline 2')).toBe(2);
      expect(extractor.countLines('line 1\nline 2\nline 3')).toBe(3);
    });
  });
});