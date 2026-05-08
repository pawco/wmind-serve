#!/usr/bin/env node
import { Command } from 'commander';
import pc from 'picocolors';
import { detectHardware, formatChipName, modelFitsHardware, modelTightFit, getAvailableRamGB } from './hardware.js';
import { getCatalog, getDefaultModel, findCatalogModel, filterCatalogByRam } from './catalog.js';
import { scanAllCaches, scanHfCache, isModelDownloaded, getModelSnapshotPath } from './scanner.js';
import { loadIndex, saveIndex, addCatalogModelToIndex, addScannedModelToIndex, removeModelFromIndex, getTotalDiskUsage, formatBytes } from './index-manager.js';
import { downloadModel, deleteModelFromCache } from './downloader.js';
import { startServer, stopServer, getServerStatus, isServerRunning, ensureVenv } from './server.js';
import { configureWmind, clearWmindConfig } from './wmind-config.js';
import { VERSION } from './version.js';
import { DEFAULT_PORT, getPortFromEnv } from './config.js';

const program = new Command()
	.name('wmind-serve')
	.description('Fast local LLM inference server for Working Mind')
	.version(VERSION);

program
	.command('start')
	.description('Start local inference server (downloads model if needed)')
	.option('-m, --model <name>', 'Model to serve', '')
	.option('-p, --port <number>', 'Port to bind', String(getPortFromEnv()))
	.action(async (opts) => {
		console.log(pc.cyan(`wmind-serve v${VERSION}`));
		console.log('');

		const hw = detectHardware();
		console.log(pc.dim(`  Hardware: ${formatChipName(hw.chip)} (${hw.unifiedMemoryGB} GB, ${hw.gpuCores} GPU cores)`));

		const venvReady = await ensureVenv();
		if (!venvReady) {
			console.error(pc.red('  Cannot set up vllm-mlx. Install manually: pip install vllm-mlx'));
			process.exit(1);
		}

		let modelName = opts.model;
		let catalogModel = modelName ? findCatalogModel(modelName) : undefined;

		if (!catalogModel) {
			if (modelName) {
				console.error(pc.red(`  Unknown model: ${modelName}`));
				console.log(pc.dim('  Run: wmind-serve models available'));
				process.exit(1);
			}

			catalogModel = getDefaultModel();
			modelName = catalogModel.name;

			if (!modelFitsHardware(catalogModel.minRamGB, hw)) {
				const smaller = getCatalog().filter((m) => modelFitsHardware(m.minRamGB, hw));
				if (smaller.length > 0) {
					catalogModel = smaller[0];
					modelName = catalogModel.name;
				} else {
					console.error(pc.red('  No model fits your hardware.'));
					process.exit(1);
				}
			}
		}

		const cm = catalogModel;

		const tight = modelTightFit(cm.minRamGB, hw);
		if (tight) {
			console.log(pc.yellow(`  Warning: ${cm.displayName} needs ~${cm.minRamGB} GB RAM.`));
			console.log(pc.yellow(`  Your ${formatChipName(hw.chip)} has ${hw.unifiedMemoryGB} GB. Performance may be limited.`));
		}

		const downloaded = isModelDownloaded(cm.hfId);
		let modelPath: string;

		if (downloaded) {
			const snapshotPath = getModelSnapshotPath(cm.hfId);
			if (!snapshotPath) {
				console.error(pc.red(`  Model cache corrupted for ${cm.hfId}`));
				process.exit(1);
			}
			modelPath = snapshotPath;
			console.log(pc.dim(`  Model: ${cm.displayName} (${cm.sizeHuman}) ${pc.green('cached')}`));
		} else {
			console.log(pc.dim(`  Model: ${cm.displayName} (${cm.sizeHuman}) ${pc.yellow('downloading...')}`));
			const result = await downloadModel(cm.hfId, (msg) => console.log(msg));
			if (!result.success) {
				console.error(pc.red(`  Download failed: ${result.error}`));
				process.exit(1);
			}

			const snapshotPath = getModelSnapshotPath(cm.hfId);
			if (!snapshotPath) {
				console.error(pc.red('  Download succeeded but model not found in cache.'));
				process.exit(1);
			}
			modelPath = snapshotPath;
		}

		let index = loadIndex();
		const scanned = scanHfCache();
		const scannedModel = scanned.find((s) => s.hfId === cm.hfId);
		index = addCatalogModelToIndex(
			index,
			cm,
			modelPath,
			tight,
			scannedModel ? new Date().toISOString() : null,
		);
		saveIndex(index);

		const port = parseInt(opts.port, 10);
		console.log(pc.dim(`  Starting server on port ${port}...`));

		const result = await startServer(modelPath, modelName, port);
		if (!result.success) {
			console.error(pc.red(`  ${result.error}`));
			process.exit(1);
		}

		configureWmind(`http://127.0.0.1:${port}/v1`, modelName);

		console.log('');
		console.log(pc.green(`  Ready: http://127.0.0.1:${port}/v1`));
		console.log(pc.dim(`  wmind will use local-fast by default.`));
	});

program
	.command('stop')
	.description('Stop the inference server')
	.action(() => {
		stopServer();
		clearWmindConfig();
	});

program
	.command('status')
	.description('Show server state')
	.action(async () => {
		const status = await getServerStatus();
		if (status.running) {
			console.log(pc.green('  Running'));
			console.log(pc.dim(`  Model: ${status.model ?? 'unknown'}`));
			console.log(pc.dim(`  Port:  ${status.port}`));
			console.log(pc.dim(`  PID:   ${status.pid ?? 'unknown'}`));
			console.log(pc.dim(`  API:   ${status.baseUrl}`));
		} else {
			console.log(pc.dim('  Not running'));
			if (status.model) {
				console.log(pc.dim(`  Last model: ${status.model}`));
			}
		}
	});

const modelsCmd = program.command('models').description('Manage local models');

modelsCmd
	.command('list')
	.description('List downloaded models')
	.action(() => {
		let index = loadIndex();

		// Auto-scan to pick up new models
		const allScanned = scanAllCaches();
		for (const scanned of allScanned) {
			if (index.models[scanned.id]) continue;
			index = addScannedModelToIndex(index, scanned, false);
		}
		saveIndex(index);

		const models = Object.values(index.models);

		if (models.length === 0) {
			console.log(pc.dim('  No models found. Run: wmind-serve models scan'));
			return;
		}

		const hfModels = models.filter((m) => m.source === 'huggingface');
		const ollamaModels = models.filter((m) => m.source === 'ollama');

		if (hfModels.length > 0) {
			console.log(pc.bold('\n  HuggingFace / MLX Models:\n'));
			for (const m of hfModels) {
				const fitLabel = m.tightFit ? pc.yellow(' (tight)') : '';
				const src = pc.dim(`[${m.source}]`);
				console.log(`  ${pc.bold(m.name.padEnd(35))} ${m.sizeHuman.padEnd(10)} ${m.params.padEnd(5)} ${m.quant.padEnd(6)} ${src} ${fitLabel}`);
			}
		}

		if (ollamaModels.length > 0) {
			console.log(pc.bold('\n  Ollama Models:\n'));
			for (const m of ollamaModels) {
				const src = pc.dim(`[${m.source}]`);
				console.log(`  ${pc.bold(m.name.padEnd(35))} ${m.sizeHuman.padEnd(10)} ${m.params.padEnd(5)} ${m.quant.padEnd(6)} ${src}`);
			}
		}

		const total = formatBytes(getTotalDiskUsage(index));
		console.log(pc.dim(`\n  Total: ${total} in ${models.length} model(s)\n`));
	});

modelsCmd
	.command('available')
	.description('Browse model catalog')
	.option('--all', 'Show all models (not just hardware-fitted)')
	.action((opts) => {
		const catalog = getCatalog();
		const hw = detectHardware();
		const availableRam = getAvailableRamGB(hw);
		const index = loadIndex();

		let filtered = catalog;
		if (!opts.all) {
			filtered = filterCatalogByRam(catalog, availableRam);
		}

		const recommended = filtered.filter((m) => modelFitsHardware(m.minRamGB, hw) && !modelTightFit(m.minRamGB, hw));
		const tightFits = filtered.filter((m) => modelTightFit(m.minRamGB, hw));
		const tooLarge = opts.all ? catalog.filter((m) => !modelFitsHardware(m.minRamGB, hw)) : [];

		if (recommended.length > 0) {
			console.log(pc.bold(`\n  Recommended for ${formatChipName(hw.chip)} (${hw.unifiedMemoryGB} GB):\n`));
			for (const m of recommended) {
				const dl = index.models[m.name]?.downloadedAt ? pc.green('downloaded') : pc.dim('not downloaded');
				console.log(`  ${pc.bold(m.name.padEnd(35))} ${m.sizeHuman.padEnd(10)} ${m.params.padEnd(5)} ${m.quant.padEnd(6)} ${dl}`);
			}
		}

		if (tightFits.length > 0) {
			console.log(pc.bold(`\n  Fits but may be slow on ${formatChipName(hw.chip)}:\n`));
			for (const m of tightFits) {
				const dl = index.models[m.name]?.downloadedAt ? pc.green('downloaded') : pc.dim('not downloaded');
				console.log(`  ${pc.bold(m.name.padEnd(35))} ${m.sizeHuman.padEnd(10)} ${m.params.padEnd(5)} ${m.quant.padEnd(6)} ${dl}`);
			}
		}

		if (tooLarge.length > 0) {
			console.log(pc.bold('\n  Too large for current hardware:\n'));
			for (const m of tooLarge) {
				console.log(`  ${pc.bold(m.name.padEnd(35))} ${m.sizeHuman.padEnd(10)} ${m.params.padEnd(5)} ${m.quant.padEnd(6)} ${pc.red(`needs ${m.minRamGB} GB`)}`);
			}
		}

		console.log(pc.dim('\n  Use \'wmind-serve start\' to download and start a model.\n'));
	});

program
	.command('pull <name>')
	.description('Download a model from catalog')
	.action(async (name) => {
		const catalogModel = findCatalogModel(name);
		if (!catalogModel) {
			console.error(pc.red(`  Unknown model: ${name}`));
			console.log(pc.dim('  Run: wmind-serve models available'));
			process.exit(1);
		}

		if (isModelDownloaded(catalogModel.hfId)) {
			console.log(pc.dim(`  ${catalogModel.displayName} already downloaded.`));
			return;
		}

		const hw = detectHardware();
		if (!modelFitsHardware(catalogModel.minRamGB, hw)) {
			console.log(pc.yellow(`  Warning: ${catalogModel.displayName} needs ~${catalogModel.minRamGB} GB RAM.`));
			console.log(pc.yellow(`  Your ${formatChipName(hw.chip)} has ${hw.unifiedMemoryGB} GB.`));
		}

		console.log(pc.dim(`  Downloading ${catalogModel.displayName} (${catalogModel.sizeHuman})...`));
		const result = await downloadModel(catalogModel.hfId, (msg) => console.log(msg));

		if (!result.success) {
			console.error(pc.red(`  Download failed: ${result.error}`));
			process.exit(1);
		}

		const snapshotPath = getModelSnapshotPath(catalogModel.hfId);
		const tight = modelTightFit(catalogModel.minRamGB, hw);
		let index = loadIndex();
		index = addCatalogModelToIndex(index, catalogModel, snapshotPath ?? '', tight, new Date().toISOString());
		saveIndex(index);

		console.log(pc.green(`  Downloaded ${catalogModel.displayName}`));
	});

modelsCmd
	.command('rm <name>')
	.description('Delete a downloaded model from cache and index')
	.action(async (name) => {
		const index = loadIndex();
		const indexed = index.models[name];
		if (!indexed) {
			console.error(pc.red(`  Model not found: ${name}`));
			process.exit(1);
		}

		const running = await isServerRunning();
		if (running) {
			const status = await getServerStatus();
			if (status.model === name) {
				console.log(pc.yellow('  This model is currently running. Stop the server first: wmind-serve stop'));
				process.exit(1);
			}
		}

		if (indexed.source === 'huggingface' && indexed.hfId) {
			const deleted = await deleteModelFromCache(indexed.hfId);
			if (deleted) {
				const updated = removeModelFromIndex(index, name);
				saveIndex(updated);
				console.log(pc.green(`  Removed ${name}. Freed ${indexed.sizeHuman}.`));
			} else {
				console.log(pc.yellow('  Could not delete from HuggingFace cache. Removed from index only.'));
				const updated = removeModelFromIndex(index, name);
				saveIndex(updated);
			}
		} else {
			const updated = removeModelFromIndex(index, name);
			saveIndex(updated);
			console.log(pc.green(`  Removed ${name} from index.`));
			console.log(pc.dim('  Use ollama rm to delete Ollama models.'));
		}
	});

modelsCmd
	.command('scan')
	.description('Scan all caches for models')
	.action(() => {
		console.log(pc.dim('  Scanning caches...'));
		const allScanned = scanAllCaches();
		const hw = detectHardware();
		let index = loadIndex();
		let added = 0;

		for (const model of allScanned) {
			if (index.models[model.id]) continue;

			const tight = model.catalogModel
				? modelTightFit(model.catalogModel.minRamGB, hw)
				: false;
			index = addScannedModelToIndex(index, model, tight);
			added++;
		}

		saveIndex(index);

		if (added > 0) {
			console.log(pc.green(`  Found ${added} new model(s).`));
		} else {
			console.log(pc.dim('  No new models found.'));
		}

		const total = Object.keys(index.models).length;
		const hfCount = Object.values(index.models).filter((m) => m.source === 'huggingface').length;
		const ollamaCount = Object.values(index.models).filter((m) => m.source === 'ollama').length;
		console.log(pc.dim(`  Index: ${total} model(s) (${hfCount} HuggingFace, ${ollamaCount} Ollama)`));
	});

modelsCmd
	.command('disk')
	.description('Show disk usage of tracked models')
	.action(() => {
		const index = loadIndex();
		const total = getTotalDiskUsage(index);
		const count = Object.keys(index.models).length;
		console.log(pc.dim(`  ${formatBytes(total)} in ${count} model(s)`));
	});

program.parse();
