import { normalize } from 'path';
import Pattern from '../pattern';
import { Segment } from '../segment';

type UrlGroup = Map<string, PatternGroup>;
type PatternGroup = Map<number, Pattern[]>;
type Threshold = number | number[];
type ThresholdGenerator = (patterns: Pattern[]) => Threshold;
type DynamicFeature = RegExp | ((word: string) => boolean);
interface TreeNode {
  segment: Segment;
  children: Map<string, TreeNode>;
}

/**
 * Group urls based on origin and number of path segments.
 *
 * @param {string[]} urls - Raw url dataset.
 * @returns {UrlGroup} - Grouped urls.
 */
function groupUrls(urls: string[]): UrlGroup {
  const pathGroup: Map<string, Map<string, number>> = new Map();
  // Deduplicate urls based on origin and path.
  urls.forEach((url, index) => {
    // Determine if it is empty line
    if (url !== '') {
      const u = new URL(url);
      const origin = u.origin;

      let path = normalize(u.pathname);
      if (path.length > 0 && path.slice(-1) === '/') {
        path = path.slice(0, -1);
      }
      if (!pathGroup.has(origin)) {
        pathGroup.set(origin, new Map());
      }
      const freq = pathGroup.get(origin)?.get(path) || 0;
      pathGroup.get(origin)?.set(path, freq + 1);
    }
  });
  // Group urls
  const urlGroup: UrlGroup = new Map();
  for (const [origin, paths] of pathGroup) {
    for (const [path, freq] of paths) {
      const segments: Segment[] = [];
      if (path.length > 0) {
        path
          .slice(1)
          .split('/')
          .forEach((e) => {
            segments.push(Segment.newStatic(e));
          });
      }

      const pattern = new Pattern(segments, freq);
      const len = pattern.length;

      if (!urlGroup.has(origin)) {
        urlGroup.set(origin, new Map());
      }
      const patternGroup = urlGroup.get(origin);

      if (!patternGroup?.has(len)) {
        patternGroup?.set(len, []);
      }
      patternGroup?.get(len)?.push(pattern);
    }
  }

  return urlGroup;
}
/**
 * Build path tree.
 *
 * @param {Pattern[]} patterns - path patterns.
 * @returns {TreeNode} - Root node of path tree.
 */
function buildTree(patterns: Pattern[]) {
  const root: TreeNode = {
    segment: Segment.newStatic(''),
    children: new Map(),
  };
  for (const { segments } of patterns) {
    for (let i = 0, node = root; i < segments.length; i++) {
      const segment = segments[i];
      const key = segment.key;
      if (!node.children.has(key)) {
        node.children.set(key, {
          segment,
          children: new Map(),
        });
      }
      node = node.children.get(key) as TreeNode;
    }
  }
  return root;
}
/**
 * Optimize path tree, merge nodes of same type into a single dynamic node.
 *
 * @param {TreeNode} root - Root node of path tree.
 * @param {number} threshold - Number of threshold, used to determin whether a subtree should be optimized.
 */
function optimizeTree(root: TreeNode, threshold: number) {
  const stack = [root];
  let node: TreeNode | undefined;
  while ((node = stack.pop())) {
    if (node.children.size > threshold) {
      const { m, dynamicLayerCount } = findConvergentNodes(node, threshold);
      cleanStaticNodes(node, m, dynamicLayerCount);
      addDynamicNodes(node, m, dynamicLayerCount);
      stack.push(node);
    } else {
      stack.push(...Array.from(node.children).map(([_, v]) => v));
    }
  }
}
/**
 *
 * @param {TreeNode} startNode - Start node.
 * @param {number} threshold - Number of threshold.
 * @returns - map of convergent nodes and total dynamic layer count.
 */
function findConvergentNodes(startNode: TreeNode, threshold: number) {
  let dynamicLayerCount = 1,
    lastDynamicLayer = [...startNode.children].map(([_, v]) => v),
    m: Map<string, TreeNode[]>;
  while (true) {
    const temp: TreeNode[] = [];
    m = new Map();
    // Try to find convergent nodes on next layer.
    for (const item of lastDynamicLayer) {
      for (const [_, child] of item.children) {
        const key = child.segment.key;
        if (!m.has(key)) {
          m.set(key, []);
        }
        m.get(key)?.push(child);
        temp.push(child);
      }
    }

    // Reserve convergent nodes only.
    for (const [k, v] of m) {
      if (v.length <= threshold) {
        m.delete(k);
      }
    }
    // Loop until convergent nodes found or last layer reached.
    if (m.size > 0 || temp.length === 0) {
      break;
    }
    lastDynamicLayer = temp;
    dynamicLayerCount++;
  }
  return {
    dynamicLayerCount,
    m,
  };
}
/**
 * Clean static nodes that are determined to be dynamic parameters.
 *
 * @param {TreeNode} startNode - Start node.
 * @param {Map<string, TreeNode[]>} m - Convergent nodes.
 * @param {number} dynamicLayerCount - The total count of dynamic layers.
 */
function cleanStaticNodes(
  startNode: TreeNode,
  m: Map<string, TreeNode[]>,
  dynamicLayerCount: number
) {
  if (m.size > 0) {
    // Remove nodes between start node and convergent nodes.
    const stack1: TreeNode[] = [startNode];
    const stack2: TreeNode[] = [];
    let node: TreeNode | undefined;
    while ((node = stack1.pop())) {
      if (
        stack2.length < dynamicLayerCount + 2 &&
        node !== stack2[stack2.length - 1]
      ) {
        stack2.push(node);
      } else {
        stack2.pop();
        continue;
      }
      if (stack2.length === dynamicLayerCount + 2) {
        if (m.has(node.segment.key)) {
          for (let i = stack2.length - 2; i >= 0; i--) {
            const cur = stack2[i];
            const pre = stack2[i + 1];
            const key = pre.segment.key;

            cur.children.delete(key);
            if (cur.children.size > 0) {
              break;
            }
          }
        }
        stack2.pop();
      } else {
        stack1.push(node, ...Array.from(node.children).map(([_, v]) => v));
      }
    }
  } else {
    // Remove all child nodes if there is no convergent node found.
    startNode.children.clear();
  }
}
/**
 * Add dynamic nodes
 *
 * @param {TreeNode} startNode - Start node.
 * @param {Map<string, TreeNode[]>} m - Convergent nodes.
 * @param {number} dynamicLayerCount - The total count of dynamic layers.
 */
function addDynamicNodes(
  startNode: TreeNode,
  m: Map<string, TreeNode[]>,
  dynamicLayerCount: number
) {
  let node = startNode;
  for (let i = 0; i < dynamicLayerCount; i++) {
    const dynamicNode: TreeNode = {
      segment: Segment.newDynamic(),
      children: new Map(),
    };
    const key = dynamicNode.segment.key;
    if (!node.children.has(key)) {
      node.children.set(key, dynamicNode);
    }
    node = node.children.get(key) as TreeNode;
  }
  for (const [k, v] of m) {
    const mergedTree = v.reduce((pre, cur) => {
      if (!pre) {
        return cur;
      }
      return mergeTree(pre, cur);
    }, node.children.get(k)) as TreeNode;
    node.children.set(k, mergedTree);
  }
}
/**
 * Merge two trees with same root node key.
 *
 * @param {TreeNode} node1 - Root node of the first tree to merge.
 * @param {TreeNode} node2 - Root node of the second tree to merge.
 * @returns {TreeNode} - Root node of the merged tree.
 */
function mergeTree(node1: TreeNode, node2: TreeNode) {
  if (node1.segment.key !== node2.segment.key) {
    throw Error('Trees with diffrent root node keys can not be merged');
  }
  const node: TreeNode = {
    segment: new Segment(node1.segment.type, node1.segment.val),
    children: new Map(),
  };
  for (const [k, v] of node1.children) {
    node.children.set(k, v);
  }
  node1.children.clear();
  for (const [k, v] of node2.children) {
    if (!node.children.has(k)) {
      node.children.set(k, v);
    } else {
      node.children.set(k, mergeTree(node.children.get(k) as TreeNode, v));
    }
  }
  node2.children.clear();

  return node;
}
/**
 * Extract all dynamic patterns from a tree.
 *
 * @param {TreeNode} root - Root node of tree.
 * @returns {Pattern[]} - Dynamic patterns on tree.
 */
function extractDynamicPatterns(root: TreeNode) {
  const patterns: Pattern[] = [];
  function visitTree(node: TreeNode, segments: Segment[] = []) {
    if (node.children.size === 0) {
      const pattern = new Pattern(segments);
      if (pattern.isDynamic()) {
        patterns.push(pattern);
      }
      return;
    }
    for (const [_, child] of node.children) {
      const nextSegment: Segment = new Segment(
        child.segment.type,
        child.segment.val
      );
      visitTree(child, [...segments, nextSegment]);
    }
  }
  visitTree(root);
  return patterns;
}
/**
 *
 * Optimize raw patterns.
 *
 * @param {Pattern[]} currentOptimalPatterns - Current optimal patterns.
 * @param {Pattern[]} rawPatterns - Raw patterns to be optimized.
 * @param {Threshold} threshold - Number of threshold.
 * @param {number} mode - Mode of optimization.
 * @returns {Pattern[]} - Optimal patterns.
 */
function optimizePatterns(
  currentOptimalPatterns: Pattern[],
  rawPatterns: Pattern[],
  threshold: Threshold | ThresholdGenerator,
  dynamicFeatures: DynamicFeature[] = []
): Pattern[] {
  rawPatterns = mergePatterns(...currentOptimalPatterns, ...rawPatterns);
  let patternsToOptimize = rawPatterns;
  if (typeof threshold === 'function') {
    threshold = threshold(rawPatterns);
  }
  if (Array.isArray(threshold)) {
    if (threshold[1]) {
      patternsToOptimize = rawPatterns.filter(
        (p) => p.freq <= (threshold as number[])[1] || p.isDynamic()
      );
    }
    threshold = threshold[0];
  }
  const root = buildTree(patternsToOptimize);
  optimizeTree(root, threshold);
  const dynamicPatterns = extractDynamicPatterns(root);
  const optimalDynamicPatterns = optimizeDynamicPatterns(
    dynamicPatterns,
    patternsToOptimize,
    threshold
  );
  const optimalPatterns = mergePatterns(
    ...rawPatterns,
    ...optimalDynamicPatterns
  );
  return mergePatterns(
    ...optimalPatterns,
    ...extractDynamicPatternsByFeatures(optimalPatterns, dynamicFeatures)
  );
}
/**
 * Optimize dynamic patterns.
 *
 * @param {Pattern[]} dynamicPatterns - Dynamic patterns to be optimized.
 * @param {Pattern[]} rawPatterns - Raw patterns.
 * @param {number} threshold - Number of threshold.
 * @returns {Pattern[]} - Optimial dynamic patterns.
 */
function optimizeDynamicPatterns(
  dynamicPatterns: Pattern[],
  rawPatterns: Pattern[],
  threshold: number
) {
  const optimalPatterns: Pattern[] = [];
  const stack = [...dynamicPatterns];

  let p: Pattern | undefined;
  while ((p = stack.pop())) {
    const samples = p.sample(rawPatterns);
    if (samples.length === 0) {
      continue;
    }
    const root = buildTree(samples);
    optimizeTree(root, threshold);
    const optimizedPatterns = extractDynamicPatterns(root);
    if (optimizedPatterns.length !== 1 || !p.equals(optimizedPatterns[0])) {
      stack.push(...optimizedPatterns);
    } else {
      optimalPatterns.push(p);
    }
  }
  return optimalPatterns;
}
/**
 * Merge multiple patterns.
 *
 * @param {Pattern[]} patterns - Patterns to be merged.
 * @returns {Pattern[]} - Merged patterns.
 */
function mergePatterns(...patterns: Pattern[]) {
  const sm: Map<string, Pattern> = new Map();
  const dm: Map<string, Pattern> = new Map();
  for (const p of patterns) {
    if (p.isDynamic()) {
      Array.from(dm).forEach(([k, v]) => {
        if (p.contains(v)) {
          p.freq += v.freq;
          p.samples.push(...v.samples);
          dm.delete(k);
        }
      });
      let flag = false;
      Array.from(dm).forEach(([k, v]) => {
        if (v.contains(p)) {
          v.freq += p.freq;
          v.samples.push(...p.samples);
          flag = true;
        }
      });
      if (!flag) {
        dm.set(p.key, p);
      }
    } else {
      if (!sm.has(p.key)) {
        sm.set(p.key, p);
      } else {
        (sm.get(p.key) as Pattern).freq += p.freq;
      }
    }
  }
  for (const [_, dv] of dm) {
    Array.from(sm).forEach(([sk, sv]) => {
      if (dv.match(sv)) {
        dv.freq += sv.freq;
        dv.samples.push(sv);
        sm.delete(sk);
      }
    });
  }
  return [
    ...Array.from(sm).map(([_, sv]) => sv),
    ...Array.from(dm).map(([_, dv]) => dv),
  ];
}
/**
 * Extract dynamic patterns by feature matching
 *
 * @param {Pattern[]} rawPatterns - Raw url path patterns.
 * @param {DynamicFeature[]} dynamicFeatures - Dynamic parameters features.
 * @returns {Pattern[]} - Dynamic patterns.
 */
function extractDynamicPatternsByFeatures(
  rawPatterns: Pattern[],
  dynamicFeatures: DynamicFeature[]
) {
  const m: Map<string, Pattern> = new Map();
  for (const p of rawPatterns) {
    let match = false;
    const segments = p.segments.map((s) => {
      if (s.isDynamic()) {
        return s;
      }
      const isDynamic = dynamicFeatures.some((f) => {
        if (f instanceof RegExp) {
          return f.test(s.val);
        }
        if (typeof f === 'function') {
          return f(s.val);
        }
        return false;
      });
      if (isDynamic) {
        match = true;
        return Segment.newDynamic();
      }
      return s;
    });
    if (match) {
      const dp = new Pattern(segments);
      if (!m.has(dp.key)) {
        m.set(dp.key, dp);
      }
    }
  }
  return Array.from(m).map(([_, p]) => p);
}

export { groupUrls, optimizePatterns };
export type {
  UrlGroup,
  PatternGroup,
  Threshold,
  ThresholdGenerator,
  DynamicFeature,
  TreeNode,
};
