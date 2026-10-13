"""Runs every test script; exit code 1 if any fails. Screenshots go to test/out/."""
import subprocess, sys, pathlib
here = pathlib.Path(__file__).parent
failed = []
for name in ('smoke_test.py', 'app_test.py', 'rotate_test.py', 'intro_test.py', 'bot_playthrough.py', 'finale_test.py', 'studio_test.py'):
    print(f'\n== {name}', flush=True)
    if subprocess.run([sys.executable, str(here / name)]).returncode:
        failed.append(name)
print('\nall passed' if not failed else f'\nfailed: {", ".join(failed)}')
sys.exit(1 if failed else 0)
