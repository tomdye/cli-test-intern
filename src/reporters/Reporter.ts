import 'istanbul'; /* import for side-effects */

import { accessSync, constants, readFileSync } from 'fs';
import { red, green, grey, white, bold } from 'chalk';
import * as intern from 'intern';
import * as Suite from 'intern/lib/Suite';
import * as Test from 'intern/lib/Test';
import * as Runner from 'intern/lib/reporters/Runner';
import * as util from 'intern/lib/util';
import * as Collector from 'istanbul/lib/collector';
import * as JsonReporter from 'istanbul/lib/report/json';
import * as nodeUtil from 'util';

const DEFAULT_COVERAGE_FILENAME = 'coverage-final.json';

module Reporter { }

class Reporter extends Runner {
	private _collector = new Collector();
	private _errors: { [sessionId: string ]: any[] } = {};
	private _filename: string;
	private _output: NodeJS.WritableStream;
	private _mode: string;

	constructor(config: any = {}) {
		super(config);

		this._filename = config.file || DEFAULT_COVERAGE_FILENAME;

		this.reporter = new JsonReporter({
			file: this._filename,
			watermarks: config.watermarks
		});

		/* istanbul ignore next */
		this._output = config.output || process.stdout;

		this._mode = config.mode || intern.mode;
	}

	private _writeCoverage(): void {

		function checkCoverageFinal() {
			try {
				accessSync(DEFAULT_COVERAGE_FILENAME, constants.R_OK);
			}
			catch (e) {
				return false;
			}
			return true;
		}

		if (checkCoverageFinal()) {
			/* There is already coverage collected from a previous run */
			this._collector.add(JSON.parse(readFileSync(this._filename, { encoding: 'utf8' })));
		}

		this.reporter.writeReport(this._collector, true);
	}

	coverage(sessionId: string, coverage: any) {
		if (this._mode === 'client' || sessionId) {
			const session = this.sessions[sessionId || ''];
			session.coverage = true;
			this._collector.add(coverage);
		}
	}

	runEnd() {
		let numEnvironments = 0;
		let numTests = 0;
		let numFailedTests = 0;
		let numSkippedTests = 0;

		for (const sessionId in this.sessions) {
			const session = this.sessions[sessionId];
			++numEnvironments;
			numTests += session.suite.numTests;
			numFailedTests += session.suite.numFailedTests;
			numSkippedTests += session.suite.numSkippedTests;
		}

		console.log();

		if (numFailedTests > 0) {
			console.log(red.bold(`\nReported Test Errors:\n`));
		}
		for (let sid in this._errors) {
			this._errors[sid].forEach((test) => {
				console.log(red('x ') +
					white.bold(test.id) +
					white(` (${test.timeElapsed / 1000}s)\n`) +
					red(test.error),
					'\n');
			});
		}

		let message = bold('\nTOTAL') + `: tested ${numEnvironments} platforms, ${numFailedTests}/${numTests} failed`;

		if (numSkippedTests) {
			message += ` (${numSkippedTests} skipped)`;
		}
		if (this.hasErrors && !numFailedTests) {
			message += '; fatal error occurred';
		}

		console.log((numFailedTests > 0 || this.hasErrors ? red : green)(message));

		this._writeCoverage();
	}

	suiteStart(suite: Suite): void {
		if (!suite.parent) {
			this.sessions[suite.sessionId || ''] = { suite: suite };
			if (suite.sessionId) {
				console.log(`\n‣ Created session ${suite.name} (${suite.sessionId})`);
			}
		}
	}

	suiteEnd(suite: Suite): void {
		if (suite.parent || this._mode === 'client' || !suite.sessionId) {
			return;
		}

		console.log('\n');

		const name = suite.name;
		const hasError = (function hasError(suite: any) {
			return suite.tests ? (suite.error || suite.tests.some(hasError)) : false;
		})(suite);
		const numFailedTests = suite.numFailedTests;
		const numTests = suite.numTests;
		const numSkippedTests = suite.numSkippedTests;

		let summary = nodeUtil.format('%s: %d/%d tests failed', name, numFailedTests, numTests);
		if (numSkippedTests) {
			summary += ' (' + numSkippedTests + ' skipped)';
		}

		if (hasError) {
			summary += '; fatal error occurred';
		}

		console.log((numFailedTests || hasError > 0 ? red : green)(summary) + '\n');
	}

	testFail(test: Test): void {
		if (!this._errors[test.sessionId]) {
			this._errors[test.sessionId] = [];
		}

		this._errors[test.sessionId].push({
			id: test.id,
			timeElapsed: test.timeElapsed,
			error: util.getErrorMessage(test.error)
		});

		this._output.write(red('×'));
	}

	testPass(): void {
		this._output.write(green('✓'));
	}

	testSkip(): void {
		this._output.write(grey('~'));
	}
}

export = Reporter;
