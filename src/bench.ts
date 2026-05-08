import pc from 'picocolors';
import { detectHardware, formatChipName } from './hardware.js';
import { loadServerConfig } from './index-manager.js';
import { DEFAULT_PORT } from './config.js';

interface BenchResult {
  server: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  ttftMs: number;
  totalTimeMs: number;
  tokensPerSecond: number;
  error?: string;
}

async function benchmarkCompletion(
  baseUrl: string,
  model: string,
  prompt: string,
  maxTokens: number = 100,
): Promise<BenchResult> {
  const start = Date.now();

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.7,
        stream: false,
      }),
    });

    const ttft = Date.now() - start;

    if (!response.ok) {
      const body = await response.text();
      return {
        server: baseUrl,
        model,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        ttftMs: ttft,
        totalTimeMs: Date.now() - start,
        tokensPerSecond: 0,
        error: `HTTP ${response.status}: ${body.slice(0, 200)}`,
      };
    }

    const data = await response.json();
    const usage = data.usage ?? {};
    const completionTokens = usage.completion_tokens ?? 0;
    const promptTokens = usage.prompt_tokens ?? 0;
    const totalTime = Date.now() - start;
    const tps = completionTokens > 0 ? (completionTokens / totalTime) * 1000 : 0;

    return {
      server: baseUrl,
      model,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      ttftMs: ttft,
      totalTimeMs: totalTime,
      tokensPerSecond: Math.round(tps * 10) / 10,
    };
  } catch (err: any) {
    return {
      server: baseUrl,
      model,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      ttftMs: 0,
      totalTimeMs: Date.now() - start,
      tokensPerSecond: 0,
      error: err.message,
    };
  }
}

async function runBenchmark() {
  const hw = detectHardware();
  console.log(pc.cyan(`\nwmind-serve Benchmark`));
  console.log(pc.dim(`  Hardware: ${formatChipName(hw.chip)} (${hw.unifiedMemoryGB} GB)`));
  console.log('');

  const prompts = [
    'Explain RAG architectures in 3 sentences.',
    'What is the difference between vector search and keyword search?',
    'Write a haiku about knowledge graphs.',
  ];

  const servers: { name: string; baseUrl: string; model: string }[] = [];

  const config = loadServerConfig();
  const vllmPort = config.port || DEFAULT_PORT;

  // Check vllm-mlx
  try {
    const res = await fetch(`http://127.0.0.1:${vllmPort}/health`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      servers.push({ name: 'vllm-mlx', baseUrl: `http://127.0.0.1:${vllmPort}/v1`, model: '' });

      // Try to detect model from server
      try {
        const models = await fetch(`http://127.0.0.1:${vllmPort}/v1/models`);
        const modelsData = await models.json();
        if (modelsData.data?.[0]?.id) {
          servers[0].model = modelsData.data[0].id;
        }
      } catch {}
    }
  } catch {}

  // Check Ollama
  try {
    const res = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const data = await res.json();
      const models: any[] = data.models ?? [];
      for (const m of models) {
        servers.push({ name: 'Ollama', baseUrl: 'http://localhost:11434/v1', model: m.name });
      }
    }
  } catch {}

  if (servers.length === 0) {
    console.error(pc.red('  No servers running. Start one with: wmind-serve start'));
    console.error(pc.dim('  Or start Ollama: ollama serve'));
    process.exit(1);
  }

  const results: BenchResult[] = [];

  for (const server of servers) {
    console.log(pc.bold(`  ${server.name} (${server.model || 'default'}):\n`));

    for (let i = 0; i < prompts.length; i++) {
      const prompt = prompts[i];
      process.stdout.write(`    Prompt ${i + 1}: `);

      const result = await benchmarkCompletion(server.baseUrl, server.model, prompt);
      results.push(result);

      if (result.error) {
        console.log(pc.red(`ERROR: ${result.error}`));
      } else {
        console.log(
          `${pc.green(`${result.tokensPerSecond} tok/s`)} | ` +
          `${result.completionTokens} tokens in ${result.totalTimeMs}ms | ` +
          `TTFT: ${result.ttftMs}ms`,
        );
      }
    }

    // Concurrent test (3 parallel requests)
    console.log(pc.dim(`    Concurrent (3 parallel): `));

    const concurrentStart = Date.now();
    const concurrentResults = await Promise.all(
      prompts.map((p) => benchmarkCompletion(server.baseUrl, server.model, p)),
    );
    const concurrentTotal = Date.now() - concurrentStart;

    const totalTokens = concurrentResults.reduce((s, r) => s + r.completionTokens, 0);
    const concurrentTps = totalTokens > 0 ? Math.round((totalTokens / concurrentTotal) * 1000 * 10) / 10 : 0;

    console.log(
      `      ${pc.green(`${concurrentTps} tok/s`)} aggregate | ` +
      `${totalTokens} tokens in ${concurrentTotal}ms`,
    );

    console.log('');
  }

  // Summary
  console.log(pc.bold('  Summary:\n'));
  console.log('  ' + 'Server'.padEnd(20) + 'Avg tok/s'.padEnd(12) + 'Concurrent tok/s'.padEnd(20) + 'Avg TTFT');
  console.log('  ' + '-'.repeat(65));

  for (const server of servers) {
    const serverResults = results.filter((r) => r.server === server.baseUrl && !r.error);
    const avgTps = serverResults.length > 0
      ? Math.round((serverResults.reduce((s, r) => s + r.tokensPerSecond, 0) / serverResults.length) * 10) / 10
      : 0;
    const avgTtft = serverResults.length > 0
      ? Math.round(serverResults.reduce((s, r) => s + r.ttftMs, 0) / serverResults.length)
      : 0;

    console.log(`  ${server.name.padEnd(20)} ${String(avgTps).padEnd(12)} ${'-'.padEnd(20)} ${avgTtft}ms`);
  }

  console.log('');
  console.log(pc.dim('  Results are from single-run benchmarks on local hardware.'));
  console.log(pc.dim('  Production performance depends on model, prompt length, and hardware.'));
  console.log('');
}

runBenchmark().catch((err) => {
  console.error(pc.red(`Benchmark failed: ${err.message}`));
  process.exit(1);
});
