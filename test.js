import test from 'ava';
import execa from 'execa';

test('version flag works', async t => {
	const { stdout } = await execa('./cli.js', ['--version']);
	const { stdout: stdoutAlias } = await execa('./cli.js', ['-v']);

	t.true(stdout.length > 0);
	t.true(stdoutAlias.length > 0);
});

test('help flag works', async t => {
	const { stdout } = await execa('./cli.js', ['--help']);
	const { stdout: stdoutAlias } = await execa('./cli.js', ['-h']);

	t.true(stdout.length > 0);
	t.true(stdoutAlias.length > 0);
});
