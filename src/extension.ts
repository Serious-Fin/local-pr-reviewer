import * as vscode from 'vscode';
import { GitExtension, Repository, RefType } from './@types/git'; // typings from vscode.git's git.d.ts

class EmptyTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
        if (element) {
            return [];
        }
        return []; // always empty — this is what triggers viewsWelcome to show
    }
}

async function getGitAPI() {
    const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git');
    if (!gitExtension) {
        vscode.window.showErrorMessage('No git repository found.');
        return;
    }
    const gitExt = gitExtension.isActive ? gitExtension.exports : await gitExtension.activate();
    return gitExt.getAPI(1);
}

export async function selectBaseBranchCommand(context: vscode.ExtensionContext) {
    const git = await getGitAPI();
    const repo: Repository | undefined = git.repositories[0];

    if (!repo) {
        vscode.window.showErrorMessage('No git repository found.');
        return;
    }

    const currentBranchName = repo.state.HEAD?.name;
    const refs = await repo.getRefs({ pattern: 'refs/heads/**' });

    const picked = await vscode.window.showQuickPick(
        refs
            .map((ref: any) => ref.name)
            .filter((name: string | undefined): name is string => !!name)
            .sort((a: string, b: string) => a.localeCompare(b)),
        {
            placeHolder: 'Select a base branch to compare against',
            title: 'Base Branch',
        }
    );

    console.log(picked);

    return refs
        .map((ref: any) => ref.name)
        .filter((name: string | undefined): name is string => !!name)
        .sort((a: string, b: string) => a.localeCompare(b));

    // const localBranches = repo.state.refs.filter((ref) => ref.type === RefType.Head && ref.name).map((ref) => ref.name!);

    // const currentBranch = repo.state.HEAD?.name;

    // const picked = await vscode.window.showQuickPick(
    //     localBranches.filter((name) => name !== currentBranch),
    //     {
    //         placeHolder: 'Select a base branch to compare against',
    //         title: 'Base Branch',
    //     }
    // );

    // if (!picked) {
    //     return;
    // }

    // await context.workspaceState.update('localBranchReviewer.baseBranch', picked);
    // await vscode.commands.executeCommand('setContext', 'localBranchReviewer.baseBranchSelected', true);
}

export function activate(context: vscode.ExtensionContext) {
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

    const provider = new EmptyTreeDataProvider();

    context.subscriptions.push(vscode.window.registerTreeDataProvider('baseBranchSelection', provider));

    context.subscriptions.push(vscode.commands.registerCommand('localBranchReviewer.selectBaseBranch', () => selectBaseBranchCommand(context)));

    // context.subscriptions.push(
    //     vscode.commands.registerCommand('local-reviewer.compareBranch', async (branchName: string) => {
    //         const repo = gitBranchProvider.getRepo();
    //         if (!repo) {
    //             vscode.window.showErrorMessage('No git repository found');
    //             return;
    //         }

    //         let baseBranch: string;
    //         try {
    //             baseBranch = await resolveBaseBranch(repo);
    //         } catch (err: any) {
    //             vscode.window.showErrorMessage(err.message);
    //             return;
    //         }

    //         if (branchName === baseBranch) {
    //             vscode.window.showInformationMessage(`${branchName} is the base branch`);
    //             return;
    //         }

    //         // List of changed files between the two branches
    //         const changes = await repo.diffBetween(baseBranch, branchName);

    //         if (!changes.length) {
    //             vscode.window.showInformationMessage(`No differences between ${baseBranch} and ${branchName}`);
    //             return;
    //         }

    //         interface ChangedFileItem extends vscode.QuickPickItem {
    //             change: any; // the Change object from repo.diffBetween
    //         }

    //         const items: ChangedFileItem[] = changes.map((change: any) => ({
    //             label: vscode.workspace.asRelativePath(change.uri),
    //             description: statusToLabel(change.status),
    //             change,
    //         }));

    //         const picked = await vscode.window.showQuickPick<ChangedFileItem>(items, {
    //             placeHolder: `Changed files: ${baseBranch}...${branchName}`,
    //         });

    //         if (!picked) return;

    //         const { change } = picked; // now properly typed as ChangedFileItem
    //         const leftUri = toGitUri(change.uri, baseBranch);
    //         const rightUri = toGitUri(change.uri, branchName);
    //         const fileName = vscode.workspace.asRelativePath(change.uri);

    //         await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, `${fileName} (${baseBranch} ↔ ${branchName})`);
    //     })
    // );
}

export function deactivate() {}
