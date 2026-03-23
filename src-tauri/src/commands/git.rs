use git2::{DiffFormat, Repository, StatusOptions};
use serde::Serialize;
use tauri::command;

#[derive(Debug, Serialize)]
pub struct GitFile {
    pub path: String,
    pub status: String,
    pub staged: bool,
}

#[derive(Debug, Serialize)]
pub struct GitDiff {
    pub path: String,
    pub patch: String,
}

#[derive(Debug, Serialize)]
pub struct GitBranch {
    pub name: String,
    pub is_current: bool,
}

#[command]
pub fn git_status(project_path: String) -> Result<Vec<GitFile>, String> {
    let repo = Repository::open(&project_path).map_err(|e| e.to_string())?;

    let mut opts = StatusOptions::new();
    opts.include_untracked(true);
    opts.recurse_untracked_dirs(true);

    let statuses = repo.statuses(Some(&mut opts)).map_err(|e| e.to_string())?;

    let files = statuses
        .iter()
        .filter_map(|entry| {
            let path = entry.path()?.to_string();
            let s = entry.status();

            let (status_str, staged) = if s.is_index_new() {
                ("added".into(), true)
            } else if s.is_index_modified() {
                ("modified".into(), true)
            } else if s.is_index_deleted() {
                ("deleted".into(), true)
            } else if s.is_wt_new() {
                ("untracked".into(), false)
            } else if s.is_wt_modified() {
                ("modified".into(), false)
            } else if s.is_wt_deleted() {
                ("deleted".into(), false)
            } else {
                return None;
            };

            Some(GitFile { path, status: status_str, staged })
        })
        .collect();

    Ok(files)
}

#[command]
pub fn git_diff(project_path: String, staged: bool) -> Result<Vec<GitDiff>, String> {
    let repo = Repository::open(&project_path).map_err(|e| e.to_string())?;

    let diff = if staged {
        let head = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
        let index = repo.index().map_err(|e| e.to_string())?;
        repo.diff_tree_to_index(head.as_ref(), Some(&index), None)
            .map_err(|e| e.to_string())?
    } else {
        repo.diff_index_to_workdir(None, None)
            .map_err(|e| e.to_string())?
    };

    let mut diffs: Vec<GitDiff> = Vec::new();
    let mut current_file: Option<String> = None;
    let mut current_patch = String::new();

    diff.print(DiffFormat::Patch, |delta, _hunk, line| {
        let file = delta
            .new_file()
            .path()
            .or_else(|| delta.old_file().path())
            .and_then(|p| p.to_str())
            .unwrap_or("")
            .to_string();

        if current_file.as_deref() != Some(&file) {
            if let Some(prev_file) = current_file.take() {
                diffs.push(GitDiff { path: prev_file, patch: current_patch.clone() });
                current_patch.clear();
            }
            current_file = Some(file);
        }

        let content = std::str::from_utf8(line.content()).unwrap_or("");
        current_patch.push_str(content);
        true
    })
    .map_err(|e| e.to_string())?;

    if let Some(file) = current_file {
        diffs.push(GitDiff { path: file, patch: current_patch });
    }

    Ok(diffs)
}

#[command]
pub fn git_stage(project_path: String, paths: Vec<String>) -> Result<(), String> {
    let repo = Repository::open(&project_path).map_err(|e| e.to_string())?;
    let mut index = repo.index().map_err(|e| e.to_string())?;

    for path in &paths {
        index.add_path(std::path::Path::new(path)).map_err(|e| e.to_string())?;
    }

    index.write().map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub fn git_commit(project_path: String, message: String) -> Result<String, String> {
    let repo = Repository::open(&project_path).map_err(|e| e.to_string())?;

    let sig = repo.signature().map_err(|e| e.to_string())?;
    let mut index = repo.index().map_err(|e| e.to_string())?;
    let tree_id = index.write_tree().map_err(|e| e.to_string())?;
    let tree = repo.find_tree(tree_id).map_err(|e| e.to_string())?;

    let parent_commits: Vec<git2::Commit> = match repo.head() {
        Ok(head) => vec![head.peel_to_commit().map_err(|e| e.to_string())?],
        Err(_) => vec![],
    };

    let parents: Vec<&git2::Commit> = parent_commits.iter().collect();

    let commit_id = repo
        .commit(Some("HEAD"), &sig, &sig, &message, &tree, &parents)
        .map_err(|e| e.to_string())?;

    Ok(commit_id.to_string())
}

#[command]
pub fn git_branches(project_path: String) -> Result<Vec<GitBranch>, String> {
    let repo = Repository::open(&project_path).map_err(|e| e.to_string())?;

    let head_name = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(|s| s.to_string()));

    let branches: Vec<GitBranch> = repo
        .branches(Some(git2::BranchType::Local))
        .map_err(|e| e.to_string())?
        .filter_map(|b| b.ok())
        .filter_map(|(branch, _)| {
            let name = branch.name().ok()??.to_string();
            let is_current = head_name.as_deref() == Some(&name);
            Some(GitBranch { name, is_current })
        })
        .collect();

    Ok(branches)
}
