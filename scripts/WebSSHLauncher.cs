using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

internal static class WebSSHLauncher
{
    [STAThread]
    private static void Main()
    {
        try
        {
            var appDirectory = AppDomain.CurrentDomain.BaseDirectory;
            var nodePath = Path.Combine(appDirectory, "runtime", "node.exe");
            var entryPath = Path.Combine(appDirectory, "launch-browser.js");
            if (!File.Exists(nodePath) || !File.Exists(entryPath))
            {
                MessageBox.Show("WebSSH release files are incomplete.", "WebSSH", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            Process.Start(new ProcessStartInfo
            {
                FileName = nodePath,
                Arguments = "\"" + entryPath + "\"",
                WorkingDirectory = appDirectory,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            });
        }
        catch (Exception error)
        {
            MessageBox.Show("Unable to start WebSSH: " + error.Message, "WebSSH", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
