import fs from 'fs';
import path from 'path';
import Parser from '../src/main';

const urls = fs
  .readFileSync(path.resolve(__dirname, 'test.txt'), {
    encoding: 'utf-8',
  })
  .split('\n');

const parser = new Parser({
  threshold: [30, 1],
  dynamicFeatures: [/^\d+$/, /(%[a-zA-Z\d]{2})+/],
});

parser.update(urls);
parser.print();
