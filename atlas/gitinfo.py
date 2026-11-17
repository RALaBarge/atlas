"""What git says about age and change, read relative to HEAD so the same commit always gives the same answer."""
import subprocess

def history(root, limit=4000):
    """{"head": sha, "head_time": t, "first_time": t (within the window), "commits_90d": n, "commits": total,
        "files": {path: [short sha, time]}} or {} when root is not a git work tree."""
    run = lambda *a: subprocess.run(["git", "-C", root, *a], capture_output=True, text=True, check=True).stdout
    try:
        head = run("rev-parse", "--short=12", "HEAD").strip()
        total = int(run("rev-list", "--count", "HEAD").strip() or 0)
        log = run("log", "-n", str(limit), "--format=@%h %ct", "--name-only", "HEAD")
    except (subprocess.CalledProcessError, FileNotFoundError, ValueError):
        return {}
    files, times, cur = {}, [], None
    for line in log.split("\n"):
        if line.startswith("@"):
            sha, t = line[1:].split()
            cur = (sha, int(t)); times.append(int(t))
        elif line and cur and line not in files:
            files[line] = list(cur)
    if not times:
        return {}
    ht = times[0]
    return {"head": head, "head_time": ht, "first_time": times[-1], "window_full": len(times) < limit,
            "commits_90d": sum(1 for t in times if t >= ht - 90 * 86400), "commits": total, "files": files}
