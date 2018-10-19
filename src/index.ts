import * as AWS from 'aws-sdk'; // @see https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/
import { access, createWriteStream } from 'fs';
import { get, request } from 'https';
import { exec, spawn } from 'child_process';
import { parse } from 'url';

// Define the Lambda runtime environment (alias made during build process)
declare var lambda: {
  handler: (event: object, context: object, callback: (error?: Error | null) => void) => void;
};

const s3 = new AWS.S3(); // @see https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html

// If running outside of a Lambda (e.g. CLI node), invoke entrypoint on startup
if (!process.env.AWS_LAMBDA_FUNCTION_NAME) main();

// Register entrypoint as a Lambda handler
lambda.handler = (_event, _context, callback) => {
  main()
    .then(res => log(res) || callback(null))
    .catch(callback);
};

// Read config from environment and make it globally available
const config = {
  TERRAFORM_MONITOR_DEBUG: !!process.env.TERRAFORM_MONITOR_DEBUG,
  TERRAFORM_MONITOR_S3_BUCKET: process.env.TERRAFORM_MONITOR_S3_BUCKET || '',
  TERRAFORM_MONITOR_S3_KEY: process.env.TERRAFORM_MONITOR_S3_KEY || '',
  TERRAFORM_MONITOR_GITHUB_REPO: process.env.TERRAFORM_MONITOR_GITHUB_REPO || '',
  TERRAFORM_MONITOR_GITHUB_TOKEN: process.env.TERRAFORM_MONITOR_GITHUB_TOKEN || '',
};

// Log to console; return null for convenient returns with an || expression
function log(...args: any[]): null {
  console.log.apply(console.log, args);
  return null;
}

// Returns a Promise that resolves when the run is complete
function main(): Promise<unknown> {
  return Promise.resolve()
    .then(() => Promise.all([getTerraformVersion().then(installTerraform), getRepoHead().then(fetchRepo)]))
    .then(([terraformBin, repoPath]) =>
      Promise.resolve()
        .then(() => terraformInit(terraformBin, repoPath))
        .then(() => terraformPlan(terraformBin, repoPath)),
    )
    .then(res => console.log('RESULT', res), err => console.log('ERROR', err));
}

// Gets the Terraform state from S3 and reports the exact version being used
// @example "0.11.8"
function getTerraformVersion(): Promise<string> {
  return s3
    .getObject({
      Bucket: config.TERRAFORM_MONITOR_S3_BUCKET,
      Key: config.TERRAFORM_MONITOR_S3_KEY,
    })
    .promise()
    .then(data => JSON.parse(data.Body + '').terraform_version)
    .then(version => log(`Terraform state has version "${version}"`) || version);
}

// Installs the requested version of Terraform, if not already installed.
// Resolves with the path to its binary.
// @example "/tmp/terraform_0.11.8_linux_amd64/terraform"
function installTerraform(version: string): Promise<string> {
  const file = `terraform_${version}_linux_amd64`;
  const url = `https://releases.hashicorp.com/terraform/${version}/${file}.zip`;
  const zip = `/tmp/${file}.zip`; // @see https://aws.amazon.com/lambda/faqs/ "scratch space"
  const out = `/tmp/${file}`;
  const bin = `${out}/terraform`;
  return Promise.resolve()
    .then(() => new Promise(resolve => access(bin, resolve)))
    .then(
      res =>
        res instanceof Error // fs.access() returns an Error if the file doesn't exist
          ? new Promise((resolve, reject) => {
              const file = createWriteStream(zip);
              const request = get(url, response => response.pipe(file));
              request.on('error', reject);
              file.on('close', resolve);
            })
              .then(() => execShell(`unzip -o ${zip} -d ${out}`))
              .then(() => console.log(`Downloaded new Terraform binary: ${bin}`))
          : console.log(`Using cached Terraform binary: ${bin}`),
    )
    .then(() => bin);
}

// Promises the simple shell-output of the given command.
// Unless ignoreStderrOutput is true, automatically rejects if the command writes to stderr.
// @example execShell("ls -la")
function execShell(command: string, ignoreStderrOutput = false): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) reject(new Error(`Could not exec command "${command}": "${error}"`));
      if (stderr.length && !ignoreStderrOutput)
        reject(new Error(`Command "${command}" produced output on stderr: "${stderr}"`));
      if (typeof stdout !== 'string') reject(new Error(`Command "${command}" produced non-string stdout: "${stdout}"`));
      resolve(stdout);
    });
  });
}

// Promises the outputs and exit code of the given command.
// Note that as opposed to execShell(), this doesn't reject if the process exits non-zero.
// @see https://nodejs.org/api/child_process.html#child_process_child_process_spawn_command_args_options
function execProcess(
  opt: Partial<{
    command: string;
    args: string[];
    env: {
      [key: string]: string;
    };
    cwd: string;
  }> = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  let stdout = '';
  let stderr = '';
  return new Promise((resolve, reject) => {
    const proc = spawn(opt.command || 'false', opt.args || [], {
      cwd: opt.cwd || undefined,
      env: Object.assign({}, process.env, opt.env || {}),
    });
    proc.stdout.on('data', data => (stdout += data));
    proc.stderr.on('data', data => (stderr += data));
    proc.on('exit', code => resolve({ code, stdout, stderr }));
    proc.on('error', reject);
  });
}

// @see https://www.terraform.io/docs/commands/init.html
function terraformInit(terraformBin: string, repoPath: string) {
  console.log('Terraform init starting...');
  return Promise.resolve()
    .then(() =>
      execProcess({
        cwd: repoPath,
        command: terraformBin,
        args: [
          'init',
          '-input=false',
          '-lock=false', // since we won't be making any changes, it's not necessary to lock the state, and thus we can safely crash without leaving it locked
          '-no-color',
        ],
      }),
    )
    .then(res => {
      if (res.code || config.TERRAFORM_MONITOR_DEBUG) console.log(res.stdout + res.stderr);
      if (res.code) throw new Error(`Terraform init failed (exit code ${res.code})`);
      console.log(`Terraform init finished`);
    });
}

// @see https://www.terraform.io/docs/commands/plan.html
function terraformPlan(terraformBin: string, repoPath: string) {
  console.log('Terraform plan starting...');
  return Promise.resolve()
    .then(() =>
      execProcess({
        cwd: repoPath,
        command: terraformBin,
        args: [
          'plan',
          '-detailed-exitcode', // @see https://www.terraform.io/docs/commands/plan.html#detailed-exitcode
          '-input=false',
          '-lock=false', // since we won't be making any changes, it's not necessary to lock the state, and thus we can safely crash without leaving it locked
          '-no-color',
        ],
      }),
    )
    .then(res => {
      if (res.code === 1 || config.TERRAFORM_MONITOR_DEBUG) console.log(res.stdout + res.stderr);
      if (res.code === 1) throw new Error(`Terraform plan failed (exit code ${res.code})`);
      console.log(`Terraform plan finished`);
      return res;
    })
    .then(res => {
      let refreshCount = 0,
        pendingAdd = 0,
        pendingChange = 0,
        pendingDestroy = 0;
      const refresh = / Refreshing state.../;
      const plan = /^Plan: (\d+) to add, (\d+) to change, (\d+) to destroy./;
      res.stdout.split('\n').forEach(line => {
        if (line.match(refresh)) refreshCount++;
        if (line.match(plan)) {
          const [, a, b, c] = line.match(plan);
          pendingAdd = parseInt(a, 10);
          pendingChange = parseInt(b, 10);
          pendingDestroy = parseInt(c, 10);
        }
      });
      return {
        refreshCount,
        isUpToDate: res.code === 0, // i.e. Terraform thinks the diff is clean
        pendingAdd,
        pendingChange,
        pendingDestroy,
        pendingTotal: pendingAdd + pendingChange + pendingDestroy,
      };
    });
}

// Retrieves the current HEAD for the given branch on GitHub
// @example "b719dc5f5ebf92894e3a50052ad73c4c9b8cbd9d"
function getRepoHead(branch = 'master'): Promise<string> {
  return new Promise((resolve, reject) =>
    request(
      {
        hostname: 'api.github.com',
        path: `/repos/${config.TERRAFORM_MONITOR_GITHUB_REPO}/branches/${branch}`,
        headers: {
          Authorization: `token ${config.TERRAFORM_MONITOR_GITHUB_TOKEN}`,
          'User-Agent': 'terraform_monitor', // @see https://developer.github.com/v3/#user-agent-required
        },
      },
      res => {
        let rawData = '';
        res.setEncoding('utf8');
        res.on('data', chunk => (rawData += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(rawData));
          } catch (err) {
            reject(new Error(`Could not parse response as JSON:\n${rawData}`));
          }
        });
      },
    )
      .on('error', reject)
      .end(),
  )
    .then((res: any) => res.commit.sha as string) // TODO: Cast "res" to unknown and inspect
    .then(head => log(`Head for "${config.TERRAFORM_MONITOR_GITHUB_REPO}/${branch}" is "${head}"`) || head);
}

// Fetches the repo, at the given commit, to the scratch space, if not already fetched.
// Resolves with the path to the repo.
// @example "/tmp/repo/john-doe-terraform-infra-7b5cbf69999c86555fd6086e8c5e2e233f673b69"
function fetchRepo(repoHead: string): Promise<string> {
  const zipPath = '/tmp/repo.zip';
  const outPath = '/tmp/repo';
  const expectedExtractedPath = `${outPath}/${config.TERRAFORM_MONITOR_GITHUB_REPO.replace('/', '-')}-${repoHead}`;
  return Promise.resolve(expectedExtractedPath)
    .then(checkPathExists)
    .then(
      path => log(`Using cached Terraform repository: ${path}`) || path,
      () =>
        new Promise((resolve, reject) => {
          request(
            {
              hostname: 'api.github.com',
              path: `/repos/${config.TERRAFORM_MONITOR_GITHUB_REPO}/zipball/${repoHead}`,
              headers: {
                Authorization: `token ${config.TERRAFORM_MONITOR_GITHUB_TOKEN}`,
                'User-Agent': 'terraform_monitor', // @see https://developer.github.com/v3/#user-agent-required
              },
            },
            res => {
              if (!res.headers.location) {
                reject(new Error(`Expecting a redirect from GitHub API, got ${res.statusCode} "${res.statusMessage}"`));
                return;
              }
              const file = createWriteStream(zipPath);
              const { protocol, port, hostname, path } = parse(res.headers.location);
              request(
                {
                  protocol,
                  port: port || undefined,
                  hostname,
                  path,
                  headers: {
                    Authorization: `token ${config.TERRAFORM_MONITOR_GITHUB_TOKEN}`,
                    'User-Agent': 'terraform_monitor', // @see https://developer.github.com/v3/#user-agent-required
                  },
                },
                res => res.pipe(file),
              )
                .on('error', reject)
                .end();
              file.on('close', resolve);
            },
          )
            .on('error', reject)
            .end();
        })
          .then(() => execShell(`unzip -o ${zipPath} -d ${outPath}`))
          .then(() => expectedExtractedPath)
          .then(checkPathExists)
          .then(path => log(`Fetched Terraform repository: ${path}`) || path),
    );
}

// Promises to check that the given path exists and is readable.
// Resolves with the path that was given.
function checkPathExists(path: string): Promise<string> {
  return new Promise((resolve, reject) =>
    access(
      path,
      err => (err ? reject(new Error(`Expected path "${path}" doesn't exist or is not readable`)) : resolve(path)),
    ),
  );
}
