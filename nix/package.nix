{ lib, python3Packages }:

python3Packages.buildPythonApplication {
  pname = "oura";
  version = "0.2.0";
  pyproject = true;

  # Only what the package needs, so editing docs or analysis/ doesn't rebuild it
  src = lib.fileset.toSource {
    root = ../.;
    fileset = lib.fileset.unions [ ../pyproject.toml ../oura ];
  };

  build-system = [ python3Packages.setuptools ];
  dependencies = [ python3Packages.requests ];

  meta = {
    description = "Scrape Oura Ring data to CSV and browse it in a local dashboard";
    homepage = "https://github.com/tom8347/ouraring-scraper";
    mainProgram = "oura";
    platforms = lib.platforms.unix;
  };
}
