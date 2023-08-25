import {
  UrlGroup,
  PatternGroup,
  Threshold,
  ThresholdGenerator,
  DynamicFeature,
  groupUrls,
  optimizePatterns,
} from './utils';
import Pattern from './pattern';
import { Segment, SegmentType } from './segment';

interface ParserOptions {
  threshold: Threshold | ThresholdGenerator;
  dynamicFeatures?: DynamicFeature[];
  initialGroupJSON?: string;
}

interface PrintOptions {
  origin?: string;
  dynamicOnly?: boolean;
  maxSamples?: number;
}

class Parser {
  public threshold: Threshold | ThresholdGenerator = 100;
  public dynamicFeatures: DynamicFeature[] = [];
  public group: UrlGroup = new Map();

  constructor(options: ParserOptions) {
    this.threshold = options.threshold;
    this.dynamicFeatures = options.dynamicFeatures || [];
    if (options.initialGroupJSON) {
      this.deserializeGroup(options.initialGroupJSON);
    }
  }

  public printOrigin(origin: string, dynamicOnly = false, maxSamples = 0) {
    if (!this.group.has(origin)) {
      return;
    }

    console.log(`Origin: ${origin}`);
    console.log('==================================================');

    Array.from(this.group.get(origin) as PatternGroup)
      .sort((a, b) => a[0] - b[0])
      .forEach(([len, patterns]) => {
        console.log(`Path length: ${len}`);
        console.log('--------------------------------------------------');
        patterns.forEach((p) => {
          if (dynamicOnly && !p.isDynamic()) {
            return;
          }
          console.log(`${origin}${p.str}`);

          if (p.isDynamic() && maxSamples > 0) {
            for (let i = 0; i < p.samples.length; i++) {
              if (i >= maxSamples) {
                break;
              }
              console.log(`- ${origin}${p.samples[i].str}`);
            }
            console.log();
          }
        });
        console.log();
      });
  }

  public print(options: PrintOptions = {}) {
    if (options.origin) {
      this.printOrigin(options.origin, options.dynamicOnly, options.maxSamples);
      return;
    }

    for (const [origin] of this.group) {
      this.printOrigin(origin, options.dynamicOnly, options.maxSamples);
    }
  }

  public deserializeGroup(json: string) {
    function reviver(key: string, value: any) {
      if (typeof value === 'object' && value !== null) {
        if (value.dataType === 'Map') {
          return new Map(value.value);
        }
      }
      return value;
    }

    this.group = JSON.parse(json, reviver);
  }

  public serializeGroup() {
    function replacer(key: string, value: any) {
      if (value instanceof Map) {
        return {
          dataType: 'Map',
          value: Array.from(value.entries()),
        };
      } else {
        return value;
      }
    }

    return JSON.stringify(this.group, replacer);
  }

  public update(urls: string[]) {
    const newGroup = groupUrls(urls);
    const currentGroup = this.group;

    for (const [origin, newPatternGroup] of newGroup) {
      if (!currentGroup.has(origin)) {
        currentGroup.set(origin, new Map());
      }
      const currentPatternGroup = currentGroup.get(origin) as PatternGroup;

      for (const [len, newPatterns] of newPatternGroup) {
        if (!currentPatternGroup.has(len)) {
          currentPatternGroup.set(len, []);
        }
        const currentPatterns = currentPatternGroup.get(len) as Pattern[];
        const optimalPatterns = optimizePatterns(
          currentPatterns,
          newPatterns,
          this.threshold,
          this.dynamicFeatures
        );

        currentPatternGroup.set(len, optimalPatterns);
      }
    }
  }
}

export default Parser;
export { Segment, SegmentType, Pattern };
export type {
  UrlGroup,
  PatternGroup,
  Threshold,
  ThresholdGenerator,
  DynamicFeature,
  ParserOptions,
  PrintOptions,
};
