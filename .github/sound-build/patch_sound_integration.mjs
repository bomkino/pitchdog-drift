import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const write = (relative, content) => fs.writeFileSync(path.join(root, relative), content);

function addImport(source, statement, kind = ts.ScriptKind.TSX) {
  if (source.includes(statement)) return source;
  const sf = ts.createSourceFile('file.tsx', source, ts.ScriptTarget.Latest, true, kind);
  let insertAt = 0;
  for (const node of sf.statements) {
    if (ts.isImportDeclaration(node)) insertAt = node.end;
  }
  return source.slice(0, insertAt) + (insertAt ? '\n' : '') + statement + source.slice(insertAt);
}

function nodePropertyName(node) {
  if (!node || !node.name) return undefined;
  if (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) || ts.isNumericLiteral(node.name)) {
    return node.name.text;
  }
  return undefined;
}

function objectKeys(node) {
  return new Set(node.properties.map(nodePropertyName).filter(Boolean));
}

function applyInsertions(source, insertions) {
  return [...insertions]
    .sort((a, b) => b.position - a.position)
    .reduce((text, insertion) => text.slice(0, insertion.position) + insertion.text + text.slice(insertion.position), source);
}

function patchModel() {
  const relative = 'src/model.ts';
  let source = read(relative);
  if (source.includes('sound?: SoundSettings') || source.includes('sound: SoundSettings')) return;
  source = addImport(
    source,
    "import { cloneDefaultSoundSettings, type SoundSettings } from './sound/model';",
    ts.ScriptKind.TS,
  );
  const sf = ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let studioInterface;
  const defaultCandidates = [];
  const visit = (node) => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === 'StudioSettings') studioInterface = node;
    if (ts.isObjectLiteralExpression(node)) {
      const keys = objectKeys(node);
      if (['stage', 'motion', 'slide', 'background', 'presenter', 'output'].every((key) => keys.has(key))) {
        defaultCandidates.push(node);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!studioInterface) throw new Error('StudioSettings interface not found');
  if (!defaultCandidates.length) throw new Error('StudioSettings default object not found');
  const defaultObject = defaultCandidates.sort((a, b) => a.getWidth(sf) - b.getWidth(sf))[0];
  const beforeClose = source.slice(defaultObject.getStart(sf), defaultObject.end - 1).trimEnd();
  const comma = beforeClose.endsWith(',') ? '' : ',';
  source = applyInsertions(source, [
    { position: studioInterface.members.end, text: '\n  sound?: SoundSettings;' },
    { position: defaultObject.end - 1, text: `${comma}\n  sound: cloneDefaultSoundSettings(),\n` },
  ]);
  write(relative, source);
}

function isFunctionNode(node) {
  return ts.isFunctionDeclaration(node)
    || ts.isFunctionExpression(node)
    || ts.isArrowFunction(node)
    || ts.isMethodDeclaration(node);
}

function enclosingFunctionParameterName(node) {
  let current = node.parent;
  while (current) {
    if (isFunctionNode(current) && current.parameters.length > 0) {
      const name = current.parameters[0].name;
      if (ts.isIdentifier(name)) return name.text;
    }
    current = current.parent;
  }
  return undefined;
}

function patchValidation() {
  const relative = 'src/lib/settingsValidation.ts';
  if (!fs.existsSync(path.join(root, relative))) return;
  let source = read(relative);
  if (!source.includes("from '../sound/model'")) {
    source = addImport(source, "import { normalizeSoundSettings } from '../sound/model';", ts.ScriptKind.TS);
  }
  const sf = ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const insertions = [];
  const visit = (node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const keys = objectKeys(node);
      const required = ['stage', 'motion', 'slide', 'background', 'presenter', 'output'];
      if (required.every((key) => keys.has(key)) && !keys.has('sound')) {
        const stage = node.properties.find((property) => nodePropertyName(property) === 'stage');
        const stageText = stage ? stage.getText(sf) : '';
        const match = stageText.match(/\b([A-Za-z_$][\w$]*)\s*\.\s*stage\b/);
        const parameter = match?.[1] ?? enclosingFunctionParameterName(node) ?? 'value';
        const beforeClose = source.slice(node.getStart(sf), node.end - 1).trimEnd();
        const comma = beforeClose.endsWith(',') ? '' : ',';
        insertions.push({
          position: node.end - 1,
          text: `${comma}\n    sound: normalizeSoundSettings(${parameter}.sound),\n`,
        });
      }
    }
    if (ts.isArrayLiteralExpression(node)) {
      const values = node.elements.filter(ts.isStringLiteral).map((element) => element.text);
      const required = ['stage', 'motion', 'slide', 'background', 'presenter', 'output'];
      if (required.every((key) => values.includes(key)) && !values.includes('sound')) {
        const beforeClose = source.slice(node.getStart(sf), node.end - 1).trimEnd();
        const comma = beforeClose.endsWith(',') ? '' : ',';
        insertions.push({ position: node.end - 1, text: `${comma} 'sound'` });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (insertions.length) source = applyInsertions(source, insertions);
  write(relative, source);
}

function bindingLocalName(element) {
  return ts.isIdentifier(element.name) ? element.name.text : undefined;
}

function bindingPropertyName(element) {
  if (element.propertyName && ts.isIdentifier(element.propertyName)) return element.propertyName.text;
  return bindingLocalName(element);
}

function patchControlPanel() {
  const relative = 'src/components/ControlPanel.tsx';
  let source = read(relative);
  if (source.includes('<SoundControls ')) return;
  source = addImport(source, "import { SoundControls } from '../sound/SoundControls';", ts.ScriptKind.TSX);
  const sf = ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let component;
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'ControlPanel') component = node;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'ControlPanel') {
      if (node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
        component = node.initializer;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!component || !component.body) throw new Error('ControlPanel component not found');
  const firstParam = component.parameters[0]?.name;
  let settingsExpr;
  let callbackExpr;
  if (firstParam && ts.isObjectBindingPattern(firstParam)) {
    for (const element of firstParam.elements) {
      const prop = bindingPropertyName(element) ?? '';
      const local = bindingLocalName(element);
      if (!local) continue;
      if (prop.toLowerCase() === 'settings') settingsExpr = local;
    }
    const callbackPriority = firstParam.elements
      .map((element) => ({ prop: bindingPropertyName(element) ?? '', local: bindingLocalName(element) }))
      .find(({ prop }) => /onsettingschange|onchange|updatesettings|setsettings/i.test(prop));
    if (callbackPriority?.local) callbackExpr = callbackPriority.local;
  } else if (firstParam && ts.isIdentifier(firstParam)) {
    settingsExpr = `${firstParam.text}.settings`;
    callbackExpr = `${firstParam.text}.onSettingsChange`;
  }
  if (!settingsExpr) throw new Error('ControlPanel settings prop not found');
  if (!callbackExpr) {
    const componentText = component.body.getText(sf);
    const match = componentText.match(/\b(onSettingsChange|onChange|updateSettings|setSettings)\s*\(/);
    if (match) callbackExpr = match[1];
  }
  if (!callbackExpr) throw new Error('ControlPanel settings callback not found');

  const bodyStart = component.body.getStart(sf);
  const bodyEnd = component.body.end;
  const bodyText = source.slice(bodyStart, bodyEnd);
  const closingTags = ['</aside>', '</main>', '</section>', '</div>'];
  let insertionPosition = -1;
  for (const tag of closingTags) {
    const index = bodyText.lastIndexOf(tag);
    if (index >= 0) {
      insertionPosition = bodyStart + index;
      break;
    }
  }
  if (insertionPosition < 0) throw new Error('ControlPanel root closing tag not found');
  const jsx = `\n      <SoundControls\n        settings={${settingsExpr}}\n        onChange={(sound) => ${callbackExpr}({ ...${settingsExpr}, sound })}\n      />\n`;
  source = source.slice(0, insertionPosition) + jsx + source.slice(insertionPosition);
  write(relative, source);
}

function appendDocs() {
  const readmePath = 'README.md';
  let readme = read(readmePath);
  if (!readme.includes('## Procedural sound room')) {
    readme += `\n\n## Procedural sound room\n\nDrift includes an original, deterministic Foley engine for tactile carousel movement. Six material characters can be auditioned live and rendered as exact-length 48 kHz, 24-bit stereo WAV masters. The engine ships no third-party sound samples. See [docs/SOUND-DESIGN.md](docs/SOUND-DESIGN.md).\n`;
    write(readmePath, readme);
  }
  for (const relative of ['ASSET-LICENSE.md', 'ASSET-LICENSES.md', 'docs/ASSET-LICENSE.md']) {
    if (!fs.existsSync(path.join(root, relative))) continue;
    let text = read(relative);
    if (!text.includes('## Procedural sound')) {
      text += `\n\n## Procedural sound\n\nNo third-party sound assets are bundled. Foley is synthesized at runtime from repository source.\n`;
      write(relative, text);
    }
    break;
  }
}

patchModel();
patchValidation();
patchControlPanel();
appendDocs();
console.log('sound integration patched');
