export class ShingleFilter {
  private documentFrequency: Map<string, number> = new Map();
  private totalDocuments: number = 0;
  private threshold: number;

  // threshold: 0.0-1.0, shingles in more than threshold% of docs are filtered
  constructor(threshold: number = 0.10) {
    this.threshold = threshold;
  }

  addDocument(shingles: Set<string>): void {
    this.totalDocuments++;
    for (const shingle of shingles) {
      const count = this.documentFrequency.get(shingle) || 0;
      this.documentFrequency.set(shingle, count + 1);
    }
  }

  filter(shingles: Set<string>): Set<string> {
    if (this.totalDocuments === 0) {
      return shingles;
    }

    const maxCount = Math.floor(this.totalDocuments * this.threshold);
    const filtered = new Set<string>();

    for (const shingle of shingles) {
      const count = this.documentFrequency.get(shingle) || 0;
      if (count <= maxCount) {
        filtered.add(shingle);
      }
    }

    return filtered;
  }

  getStats(): { totalShingles: number; filteredShingles: number; totalDocuments: number } {
    const maxCount = Math.floor(this.totalDocuments * this.threshold);
    let filteredCount = 0;

    for (const count of this.documentFrequency.values()) {
      if (count > maxCount) {
        filteredCount++;
      }
    }

    return {
      totalShingles: this.documentFrequency.size,
      filteredShingles: filteredCount,
      totalDocuments: this.totalDocuments,
    };
  }
}
