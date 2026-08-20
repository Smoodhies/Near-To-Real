import { spawn } from "node:child_process";

export class ProcessRunner {
    async run(
        command,
        args,
        {
            timeout = 0,
            cwd,
        } = {},
    ) {
        return new Promise(
            (resolve, reject) => {
                const child = spawn(
                    command,
                    args,
                    {
                        cwd,
                        stdio: [
                            "ignore",
                            "pipe",
                            "pipe",
                        ],
                        windowsHide: true,
                    },
                );

                let stdout = "";
                let stderr = "";
                let settled = false;
                let timeoutId = null;

                const finish = (
                    callback,
                    value,
                ) => {
                    if (settled) return;

                    settled = true;

                    if (timeoutId) {
                        clearTimeout(
                            timeoutId,
                        );
                    }

                    callback(value);
                };

                if (timeout > 0) {
                    timeoutId = setTimeout(
                        () => {
                            child.kill(
                                "SIGTERM",
                            );

                            setTimeout(() => {
                                if (!settled) {
                                    child.kill(
                                        "SIGKILL",
                                    );
                                }
                            }, 5000);
                        },
                        timeout,
                    );
                }

                child.stdout.on(
                    "data",
                    (chunk) => {
                        stdout +=
                            chunk.toString();
                    },
                );

                child.stderr.on(
                    "data",
                    (chunk) => {
                        stderr +=
                            chunk.toString();
                    },
                );

                child.on(
                    "error",
                    (error) => {
                        finish(
                            reject,
                            error,
                        );
                    },
                );

                child.on(
                    "close",
                    (
                        exitCode,
                        signal,
                    ) => {
                        if (
                            exitCode === 0
                        ) {
                            finish(
                                resolve,
                                {
                                    stdout,
                                    stderr,
                                    exitCode,
                                    signal,
                                },
                            );

                            return;
                        }

                        const error =
                            new Error(
                                `${command} failed with exit code ${exitCode}`,
                            );

                        error.command =
                            command;
                        error.args = args;
                        error.exitCode =
                            exitCode;
                        error.signal =
                            signal;
                        error.stderr =
                            stderr;

                        finish(
                            reject,
                            error,
                        );
                    },
                );
            },
        );
    }
}