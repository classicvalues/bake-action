import * as fs from 'fs';
import * as buildx from './buildx';
import * as context from './context';
import * as stateHelper from './state-helper';
import * as core from '@actions/core';
import * as exec from '@actions/exec';

async function run(): Promise<void> {
  try {
    core.startGroup(`Docker info`);
    await exec.exec('docker', ['version']);
    await exec.exec('docker', ['info']);
    core.endGroup();

    if (!(await buildx.isAvailable())) {
      core.setFailed(`Docker buildx is required. See https://github.com/docker/setup-buildx-action to set up buildx.`);
      return;
    }
    stateHelper.setTmpDir(context.tmpDir());

    const bxVersion = await buildx.getVersion();
    const inputs: context.Inputs = await context.getInputs();
    const args: string[] = await context.getArgs(inputs, bxVersion);

    core.startGroup(`Bake definition`);
    await exec.exec('docker', [...args, '--print']);
    core.endGroup();

    await exec
      .getExecOutput('docker', args, {
        ignoreReturnCode: true
      })
      .then(res => {
        if (res.stderr.length > 0 && res.exitCode != 0) {
          throw new Error(`buildx bake failed with: ${res.stderr.match(/(.*)\s*$/)![0].trim()}`);
        }
      });

    await core.group(`Setting outputs`, async () => {
      const metadata = await buildx.getMetadata();
      if (metadata) {
        core.info(`metadata=${metadata}`);
        context.setOutput('metadata', metadata);
      }
    });
  } catch (error) {
    core.setFailed(error.message);
  }
}

async function cleanup(): Promise<void> {
  if (stateHelper.tmpDir.length > 0) {
    core.startGroup(`Removing temp folder ${stateHelper.tmpDir}`);
    fs.rmdirSync(stateHelper.tmpDir, {recursive: true});
    core.endGroup();
  }
}

if (!stateHelper.IsPost) {
  run();
} else {
  cleanup();
}
