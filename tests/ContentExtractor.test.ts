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