import * as vscode from 'vscode';

export class ChangedFileItem extends vscode.TreeItem {
    constructor(
        public readonly change: any, // Change object from repo.diffBetween
        public readonly baseBranch: string,
        public readonly compareBranch: string,
        isReviewed: boolean
    ) {
        super(vscode.workspace.asRelativePath(change.uri), vscode.TreeItemCollapsibleState.None);

        this.description = statusToLabel(change.status);
        this.contextValue = 'changedFile';
        this.resourceUri = change.uri;

        // Native checkbox — renders a checkbox next to the item
        this.checkboxState = isReviewed ? vscode.TreeItemCheckboxState.Checked : vscode.TreeItemCheckboxState.Unchecked;

        // Clicking the label (not the checkbox) still opens the diff
        this.command = {
            command: 'local-reviewer.openFileDiff',
            title: 'Open Diff',
            arguments: [this],
        };
    }

    // Stable key so we can persist reviewed state across reloads
    get key(): string {
        return `${this.baseBranch}...${this.compareBranch}:${this.change.uri.fsPath}`;
    }
}

export class ChangedFilesProvider implements vscode.TreeDataProvider<ChangedFileItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ChangedFileItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private changes: any[] = [];
    private baseBranch = '';
    private compareBranch = '';

    constructor(private context: vscode.ExtensionContext) {}

    async setComparison(baseBranch: string, compareBranch: string, changes: any[]) {
        this.baseBranch = baseBranch;
        this.compareBranch = compareBranch;
        this.changes = changes;
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ChangedFileItem): vscode.TreeItem {
        return element;
    }

    getChildren(): ChangedFileItem[] {
        if (!this.changes.length) return [];

        return this.changes.map((change) => {
            const item = new ChangedFileItem(change, this.baseBranch, this.compareBranch, this.isReviewed(change));
            return item;
        });
    }

    private reviewedKey(): string {
        return `reviewedFiles:${this.baseBranch}...${this.compareBranch}`;
    }

    private getReviewedSet(): Set<string> {
        const stored = this.context.workspaceState.get<string[]>(this.reviewedKey(), []);
        return new Set(stored);
    }

    private isReviewed(change: any): boolean {
        return this.getReviewedSet().has(change.uri.fsPath);
    }

    async setReviewed(item: ChangedFileItem, reviewed: boolean) {
        const set = this.getReviewedSet();
        if (reviewed) {
            set.add(item.change.uri.fsPath);
        } else {
            set.delete(item.change.uri.fsPath);
        }
        await this.context.workspaceState.update(this.reviewedKey(), Array.from(set));
        this._onDidChangeTreeData.fire();
    }

    reviewedCount(): number {
        return this.getReviewedSet().size;
    }
}

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
