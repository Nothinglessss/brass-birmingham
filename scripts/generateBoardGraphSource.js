const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const graphPath = path.join(repoRoot, 'data', 'brass_birmingham_location_graph.json');
const outputPath = path.join(repoRoot, 'js', 'boardGraphSource.js');
const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
const output = [
    '// Generated from data/brass_birmingham_location_graph.json. Keep the JSON file as the canonical graph source.',
    `const BOARD_GRAPH_SOURCE = Object.freeze(${JSON.stringify(graph, null, 2)});`,
    '',
].join('\n');

fs.writeFileSync(outputPath, output, 'utf8');
