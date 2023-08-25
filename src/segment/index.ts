export enum SegmentType {
  STATIC,
  DYNAMIC,
}

export class Segment {
  public type: SegmentType;
  public val = '';

  static newDynamic() {
    return new Segment(SegmentType.DYNAMIC);
  }

  static newStatic(val: string) {
    return new Segment(SegmentType.STATIC, val);
  }

  constructor(type: SegmentType, val = '') {
    this.type = type;
    this.val = val;
  }

  public get key() {
    return `${this.type}:${this.val}`;
  }

  public get str() {
    if (this.type === SegmentType.DYNAMIC) {
      return ':param';
    }
    return this.val;
  }

  public isDynamic() {
    return this.type === SegmentType.DYNAMIC;
  }
}
