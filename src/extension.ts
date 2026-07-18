// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { GitBranchProvider, GitBranch } from './gitBranches';
import { ChangedFilesProvider, ChangedFileItem } from './changedFiles';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "local-pr-reviewer" is now active!');

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
    const disposable = vscode.commands.registerCommand('local-pr-reviewer.helloWorld', () => {
        // The code you place here will be executed every time your command is executed
        // Display a message box to the user
        vscode.window.showInformationMessage('Hello World from local-pr-reviewer!');
    });

    context.subscriptions.push(disposable);

    // -------------------------
    const workspaceRoot =
        vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0 ? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined;

    // Samples of `window.registerTreeDataProvider`
    const gitBranchProvider = new GitBranchProvider();
    vscode.window.registerTreeDataProvider('localReviewerBranches', gitBranchProvider);
    vscode.commands.registerCommand('localReviewerBranches.refreshBranches', () => gitBranchProvider.refresh());

    const changedFilesProvider = new ChangedFilesProvider(context);

    const changedFilesView = vscode.window.createTreeView('changedFilesView', {
        treeDataProvider: changedFilesProvider,
    });

    registerCompareBranchCommand(context, gitBranchProvider, changedFilesProvider);

    context.subscriptions.push(changedFilesView);

    context.subscriptions.push(
        changedFilesView.onDidChangeCheckboxState(async (e) => {
            // e.items is an array of [ChangedFileItem, TreeItemCheckboxState] tuples
            for (const [item, state] of e.items) {
                await changedFilesProvider.setReviewed(item, state === vscode.TreeItemCheckboxState.Checked);
            }

            // Optional: surface progress, e.g. in the view's title/description
            changedFilesView.description = `${changedFilesProvider.reviewedCount()} reviewed`;
        })
    );

    // Separate command for actually opening the diff, since clicking now goes here
    vscode.commands.registerCommand('local-reviewer.openFileDiff', async (item: ChangedFileItem) => {
        const leftUri = toGitUri(item.change.uri, item.baseBranch);
        const rightUri = toGitUri(item.change.uri, item.compareBranch);
        const fileName = vscode.workspace.asRelativePath(item.change.uri);

        await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, `${fileName} (${item.baseBranch} ↔ ${item.compareBranch})`);
    });
}

// This method is called when your extension is deactivated
export function deactivate() {}

// Matches the URI scheme the built-in git extension's content provider
// uses to serve file contents at a specific ref.
function toGitUri(uri: vscode.Uri, ref: string): vscode.Uri {
    return uri.with({
        scheme: 'git',
        path: uri.path,
        query: JSON.stringify({ path: uri.fsPath, ref }),
    });
}

async function resolveBaseBranch(repo: any): Promise<string> {
    const refs = await repo.getRefs({ pattern: 'refs/heads/**' });
    const names = refs.map((r: any) => r.name);
    if (names.includes('master')) return 'master';
    if (names.includes('main')) return 'main';
    throw new Error('Could not find a master/main branch to diff against');
}

export function registerCompareBranchCommand(context: vscode.ExtensionContext, gitBranchProvider: GitBranchProvider) {
    context.subscriptions.push(
        vscode.commands.registerCommand('local-reviewer.compareBranch', async (branchName: string) => {
            const repo = gitBranchProvider.getRepo();
            if (!repo) {
                vscode.window.showErrorMessage('No git repository found');
                return;
            }

            let baseBranch: string;
            try {
                baseBranch = await resolveBaseBranch(repo);
            } catch (err: any) {
                vscode.window.showErrorMessage(err.message);
                return;
            }

            if (branchName === baseBranch) {
                vscode.window.showInformationMessage(`${branchName} is the base branch`);
                return;
            }

            // List of changed files between the two branches
            const changes = await repo.diffBetween(baseBranch, branchName);

            if (!changes.length) {
                vscode.window.showInformationMessage(`No differences between ${baseBranch} and ${branchName}`);
                return;
            }

            interface ChangedFileItem extends vscode.QuickPickItem {
                change: any; // the Change object from repo.diffBetween
            }

            const items: ChangedFileItem[] = changes.map((change: any) => ({
                label: vscode.workspace.asRelativePath(change.uri),
                description: statusToLabel(change.status),
                change,
            }));

            const picked = await vscode.window.showQuickPick<ChangedFileItem>(items, {
                placeHolder: `Changed files: ${baseBranch}...${branchName}`,
            });

            if (!picked) return;

            const { change } = picked; // now properly typed as ChangedFileItem
            const leftUri = toGitUri(change.uri, baseBranch);
            const rightUri = toGitUri(change.uri, branchName);
            const fileName = vscode.workspace.asRelativePath(change.uri);

            await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, `${fileName} (${baseBranch} ↔ ${branchName})`);
        })
    );
}

// Status is a numeric enum from git.d.ts (INDEX_ADDED, MODIFIED, DELETED, etc.)
function statusToLabel(status: number): string {
    const map: Record<number, string> = {
        0: 'Index Modified',
        1: 'Index Added',
        2: 'Index Deleted',
        3: 'Index Renamed',
        4: 'Index Copied',
        5: 'Modified',
        6: 'Deleted',
        7: 'Untracked',
        8: 'Ignored',
        9: 'Intent to Add',
        10: 'Added by them',
        // ... full enum is in git.d.ts's `Status`
    };
    return map[status] ?? 'Changed';
}
