import * as vscode from 'vscode';
import * as path from 'path';

export class GitBranch extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly isCurrent: boolean = false
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.tooltip = this.label;
        this.description = isCurrent ? 'current' : '';
        this.iconPath = new vscode.ThemeIcon(isCurrent ? 'git-branch' : 'circle-outline');
        this.contextValue = 'gitBranch';

        // Fires when the user clicks the item
        this.command = {
            command: 'local-reviewer.compareBranch',
            title: 'Compare with master',
            arguments: [label],
        };
    }
}

export class GitBranchProvider implements vscode.TreeDataProvider<GitBranch> {
    private _onDidChangeTreeData: vscode.EventEmitter<GitBranch | undefined | void> = new vscode.EventEmitter<GitBranch | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<GitBranch | undefined | void> = this._onDidChangeTreeData.event;

    private gitApi: any;
    private repoListenerDisposable: vscode.Disposable | undefined;

    // Fallback: first workspace folder -> else process.cwd() (covers `code .` w/ no folder registered, edge cases)
    private workspaceRoot: string | undefined = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();

    constructor() {
        this.initGitApi();
    }

    private async initGitApi(): Promise<void> {
        const gitExtension = vscode.extensions.getExtension('vscode.git');
        if (!gitExtension) {
            vscode.window.showErrorMessage('Git extension not found');
            return;
        }

        const exports = gitExtension.isActive ? gitExtension.exports : await gitExtension.activate();

        this.gitApi = exports.getAPI(1);

        if (this.gitApi.state !== 'initialized') {
            await new Promise<void>((resolve) => {
                const disposable = this.gitApi.onDidChangeState((state: string) => {
                    if (state === 'initialized') {
                        disposable.dispose();
                        resolve();
                    }
                });
            });
        }

        this.gitApi.onDidOpenRepository(() => this.refresh());
        this.gitApi.onDidCloseRepository(() => this.refresh());

        this.attachRepoListener();
        this.refresh();
    }

    public getRepo(): any {
        return this.getActiveRepo();
    }

    private attachRepoListener(): void {
        const repo = this.getActiveRepo();
        if (!repo) return;

        this.repoListenerDisposable?.dispose();
        this.repoListenerDisposable = repo.state.onDidChange(() => this.refresh());
    }

    // Prefer a repo matching workspaceRoot if we can find one, else just take the first
    private getActiveRepo(): any {
        if (!this.gitApi?.repositories?.length) return undefined;

        if (this.workspaceRoot) {
            const match = this.gitApi.repositories.find((r: any) => path.resolve(r.rootUri.fsPath) === path.resolve(this.workspaceRoot!));
            if (match) return match;
        }

        return this.gitApi.repositories[0];
    }

    refresh(): void {
        this.attachRepoListener();
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: GitBranch): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: GitBranch): Promise<GitBranch[]> {
        if (element) return [];
        if (!this.gitApi) return [];

        const repo = this.getActiveRepo();
        if (!repo) {
            vscode.window.showInformationMessage('No git repository found');
            return [];
        }

        const currentBranchName = repo.state.HEAD?.name;
        const refs = await repo.getRefs({ pattern: 'refs/heads/**' });

        return refs
            .map((ref: any) => ref.name)
            .filter((name: string | undefined): name is string => !!name)
            .sort((a: string, b: string) => a.localeCompare(b))
            .map((name: string) => new GitBranch(name, name === currentBranchName));
    }
}
