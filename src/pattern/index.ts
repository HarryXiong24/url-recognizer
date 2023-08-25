import { Segment } from '@/segment';

export default class Pattern {
  public segments: Segment[] = [];
  public freq = 0;
  public samples: Pattern[] = [];

  constructor(segments: Segment[], freq = 0) {
    this.segments = segments;
    this.freq = freq;
  }

  public get str() {
    return this.segments.reduce((prev, cur) => `${prev}/${cur.str}`, '');
  }

  public get length() {
    return this.segments.length;
  }

  public get key() {
    return this.segments.map((e) => e.key).join('/');
  }

  public isDynamic() {
    return this.segments.some((s) => s.isDynamic());
  }

  public equals(pattern: Pattern) {
    const seg1 = this.segments,
      seg2 = pattern.segments;

    if (seg1.length !== seg2.length) {
      return false;
    }

    for (let i = 0; i < seg1.length; i++) {
      if (seg1[i].type !== seg2[i].type || seg1[i].val !== seg2[i].val) {
        return false;
      }
    }

    return true;
  }

  public match(pattern: Pattern) {
    const seg1 = this.segments,
      seg2 = pattern.segments;

    if (seg1.length !== seg2.length) {
      return false;
    }

    let match = true;
    for (let i = 0; i < seg1.length; i++) {
      if (
        !seg1[i].isDynamic() &&
        !seg2[i].isDynamic() &&
        seg1[i].val !== seg2[i].val
      ) {
        match = false;
        break;
      }
    }
    return match;
  }

  public contains(pattern: Pattern) {
    const seg1 = this.segments,
      seg2 = pattern.segments;

    if (seg1.length !== seg2.length) {
      return false;
    }

    let flag = true;
    for (let i = 0; i < seg1.length; i++) {
      if (!seg1[i].isDynamic() && seg1[i].key !== seg2[i].key) {
        flag = false;
        break;
      }
    }
    return flag;
  }

  public sample(patterns: Pattern[]) {
    return patterns.filter((e) => this.match(e) && !e.isDynamic());
  }
}
