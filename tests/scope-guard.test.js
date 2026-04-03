const { ScopeGuard, resolveScope } = require('../src/scope-guard');

// --- checkFile tests ---

console.log('=== checkFile tests ===');

// No restrictions → always allowed
const noScope = new ScopeGuard({});
console.assert(noScope.checkFile('anything.js').allowed === true, 'no restrictions = allowed');

// allowFiles only
const allowOnly = new ScopeGuard({ allowFiles: ['src/**', 'tests/**'] });
console.assert(allowOnly.checkFile('src/foo.js').allowed === true, 'src/foo.js in scope');
console.assert(allowOnly.checkFile('src/deep/bar.py').allowed === true, 'src/deep/bar.py in scope');
console.assert(allowOnly.checkFile('tests/test_foo.js').allowed === true, 'tests/ in scope');
console.assert(allowOnly.checkFile('README.md').allowed === false, 'README.md out of scope');
console.assert(allowOnly.checkFile('package.json').allowed === false, 'package.json out of scope');

// denyFiles only
const denyOnly = new ScopeGuard({ denyFiles: ['node_modules/**', '.env'] });
console.assert(denyOnly.checkFile('src/foo.js').allowed === true, 'src/foo.js not denied');
console.assert(denyOnly.checkFile('node_modules/foo/index.js').allowed === false, 'node_modules denied');
console.assert(denyOnly.checkFile('.env').allowed === false, '.env denied');

// Both allow and deny
const both = new ScopeGuard({
  allowFiles: ['src/**'],
  denyFiles: ['src/secret/**']
});
console.assert(both.checkFile('src/foo.js').allowed === true, 'src/foo.js allowed');
console.assert(both.checkFile('src/secret/key.pem').allowed === false, 'src/secret denied');
console.assert(both.checkFile('README.md').allowed === false, 'README not in allowFiles');

console.log('checkFile: all passed');

// --- checkBash tests ---

console.log('\n=== checkBash tests ===');

const noScope2 = new ScopeGuard({});
console.assert(noScope2.checkBash('pip install foo').allowed === true, 'no restrictions = allowed');

const bashAllow = new ScopeGuard({ allowBash: ['grep', 'find', 'cat', 'git'] });
console.assert(bashAllow.checkBash('grep -r foo src/').allowed === true, 'grep allowed');
console.assert(bashAllow.checkBash('git status').allowed === true, 'git allowed');
console.assert(bashAllow.checkBash('pip install foo').allowed === false, 'pip not allowed');
console.assert(bashAllow.checkBash('rm -rf /').allowed === false, 'rm not allowed');

const bashDeny = new ScopeGuard({ denyBash: ['pip', 'docker', 'rm', 'sudo'] });
console.assert(bashDeny.checkBash('grep foo').allowed === true, 'grep not denied');
console.assert(bashDeny.checkBash('pip install foo').allowed === false, 'pip denied');
console.assert(bashDeny.checkBash('docker run ubuntu').allowed === false, 'docker denied');
console.assert(bashDeny.checkBash('rm -rf /').allowed === false, 'rm denied');
console.assert(bashDeny.checkBash('sudo apt-get').allowed === false, 'sudo denied');

const bashBoth = new ScopeGuard({
  allowBash: ['grep', 'cat', 'python'],
  denyBash: ['python -m pip']
});
console.assert(bashBoth.checkBash('grep foo').allowed === true, 'grep allowed');
console.assert(bashBoth.checkBash('python test.py').allowed === true, 'python allowed');
console.assert(bashBoth.checkBash('npm install').allowed === false, 'npm not in allow list');

console.log('checkBash: all passed');

// --- detectDrift tests ---

console.log('\n=== detectDrift tests ===');

const driftScope = new ScopeGuard({});

console.assert(driftScope.detectDrift('이 코드를 리팩토링하면 좋겠다') !== null, 'Korean: 리팩토링');
console.assert(driftScope.detectDrift('더 나은 방법이 있을 것 같다') !== null, 'Korean: 더 나은 방법');
console.assert(driftScope.detectDrift('방향을 바꿔야 할 것 같다') !== null, 'Korean: 방향을 바꿔');
console.assert(driftScope.detectDrift('다른 접근법을 시도해보자') !== null, 'Korean: 다른 접근');
console.assert(driftScope.detectDrift("Let me refactor this code") !== null, 'English: refactor');
console.assert(driftScope.detectDrift("I think there's a better approach") !== null, 'English: better approach');
console.assert(driftScope.detectDrift("Let me first check something") !== null, 'English: let me first');
console.assert(driftScope.detectDrift("We should change direction here") !== null, 'English: change direction');
console.assert(driftScope.detectDrift("작업 완료했습니다") === null, 'Normal text = no drift');
console.assert(driftScope.detectDrift("I fixed the bug in src/foo.js") === null, 'Normal text = no drift');

console.log('detectDrift: all passed');

// --- resolveScope tests ---

console.log('\n=== resolveScope tests ===');

const config = {
  scope: {
    defaultScope: {
      allowFiles: ['src/**'],
      description: 'default'
    },
    presets: {
      backend: {
        allowFiles: ['src/api/**'],
        description: 'backend preset'
      }
    }
  }
};

// Explicit scope takes priority
const explicit = resolveScope({ allowFiles: ['foo/**'] }, config);
console.assert(explicit !== null, 'explicit scope resolved');
console.assert(explicit.allowFiles[0] === 'foo/**', 'explicit scope has correct allowFiles');

// Preset
const preset = resolveScope(null, config, 'backend');
console.assert(preset !== null, 'preset scope resolved');
console.assert(preset.description === 'backend preset', 'preset has correct description');

// Default
const defaultScope = resolveScope(null, config);
console.assert(defaultScope !== null, 'default scope resolved');
console.assert(defaultScope.description === 'default', 'default scope has correct description');

// Nothing configured
const noConfig = resolveScope(null, {});
console.assert(noConfig === null, 'no scope when nothing configured');

console.log('resolveScope: all passed');

// --- toSummary tests ---

console.log('\n=== toSummary tests ===');

const summaryScope = new ScopeGuard({
  description: 'Test scope',
  allowFiles: ['src/**'],
  denyBash: ['pip', 'docker']
});
const summary = summaryScope.toSummary();
console.assert(summary.includes('[SCOPE 제한'), 'summary has header');
console.assert(summary.includes('Test scope'), 'summary has description');
console.assert(summary.includes('src/**'), 'summary has allowFiles');
console.assert(summary.includes('pip'), 'summary has denyBash');

console.log('toSummary: all passed');

// --- hasRestrictions tests ---

console.log('\n=== hasRestrictions tests ===');

console.assert(new ScopeGuard({}).hasRestrictions() === false, 'empty = no restrictions');
console.assert(new ScopeGuard({ allowFiles: ['a'] }).hasRestrictions() === true, 'allowFiles = has restrictions');
console.assert(new ScopeGuard({ denyBash: ['rm'] }).hasRestrictions() === true, 'denyBash = has restrictions');

console.log('hasRestrictions: all passed');

console.log('\n=== All scope-guard tests passed! ===');
