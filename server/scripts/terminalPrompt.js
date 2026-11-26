// SCRIPT HELPER: asks questions in the terminal.
// askVisible() shows what you type. askHidden() shows NOTHING while you type (not even * characters),
// and the typed text is only kept in memory: it is never written to a file or to the command history.
// Both work by reading the keyboard one key at a time ("raw mode"), so they need a real terminal.

function readLine(question, { hidden }) {
  const { stdin, stdout } = process;

  return new Promise((resolve) => {
    let text = "";
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    function finish(value) {
      stdin.removeListener("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
      resolve(value);
    }

    function onData(chunk) {
      if (chunk.startsWith("\u001b")) return; // arrow keys, Home, End... are ignored
      // A paste can arrive as one chunk with many characters, so go through it one character at a time.
      for (const char of chunk) {
        if (char === "\r" || char === "\n") return finish(text); // Enter
        if (char === "\u0003") {
          // Ctrl+C
          stdin.setRawMode(false);
          stdout.write("\nCancelled.\n");
          process.exit(130);
        }
        if (char === "\u007f" || char === "\b") {
          // Backspace
          if (text.length > 0) {
            text = Array.from(text).slice(0, -1).join("");
            if (!hidden) stdout.write("\b \b");
          }
        } else if (char >= " ") {
          text += char;
          if (!hidden) stdout.write(char);
        }
      }
    }

    stdin.on("data", onData);
  });
}

export function askVisible(question) {
  return readLine(question, { hidden: false });
}

export function askHidden(question) {
  return readLine(question, { hidden: true });
}
