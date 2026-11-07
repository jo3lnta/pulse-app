"""Generate a dependency-free Xcode project. No XcodeGen or package downloads needed."""
from pathlib import Path
import hashlib
root=Path(__file__).parent
uid=lambda name: hashlib.sha256(name.encode()).hexdigest()[:24].upper()
objects={}
def obj(key,text):
    ident=uid(key);objects[ident]=text;return ident
refs=[];sources=[];resources=[];testrefs=[];testbuild=[]
for path in sorted((root/'Pulse').rglob('*')):
    if not path.is_file() or 'Assets.xcassets' in path.parts:continue
    rel=path.relative_to(root).as_posix()
    filetype='sourcecode.swift' if path.suffix=='.swift' else ('folder.assetcatalog' if path.suffix=='.xcassets' else 'text.plist.xml')
    ref=obj(rel,f'{{isa = PBXFileReference; lastKnownFileType = {filetype}; path = "{rel}"; sourceTree = SOURCE_ROOT;}}')
    refs.append(ref)
    if path.suffix=='.swift': sources.append(obj('build:'+rel,f'{{isa = PBXBuildFile; fileRef = {ref};}}'))
    elif path.suffix=='.xcprivacy':resources.append(obj('build:'+rel,f'{{isa = PBXBuildFile; fileRef = {ref};}}'))
# Asset catalogs are one resource, not individual JSON/PNG build entries.
assets=root/'Pulse/Assets.xcassets'
if assets.exists():
    ref=obj('assets','{isa = PBXFileReference; lastKnownFileType = folder.assetcatalog; path = Pulse/Assets.xcassets; sourceTree = SOURCE_ROOT;}')
    refs.append(ref);resources.append(obj('build:assets',f'{{isa = PBXBuildFile; fileRef = {ref};}}'))
for path in sorted((root/'PulseTests').glob('*.swift')):
    rel=path.relative_to(root).as_posix();ref=obj(rel,f'{{isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = "{rel}"; sourceTree = SOURCE_ROOT;}}')
    testrefs.append(ref);testbuild.append(obj('build:'+rel,f'{{isa = PBXBuildFile; fileRef = {ref};}}'))
def array(values):return '('+','.join(values)+',)' if values else '()'
appref=obj('appref','{isa = PBXFileReference; explicitFileType = wrapper.application; path = Pulse.app; sourceTree = BUILT_PRODUCTS_DIR;}')
testref=obj('testref','{isa = PBXFileReference; explicitFileType = wrapper.cfbundle; path = PulseTests.xctest; sourceTree = BUILT_PRODUCTS_DIR;}')
products=obj('products',f'{{isa = PBXGroup; children = {array([appref,testref])}; name = Products; sourceTree = "<group>";}}')
main=obj('main',f'{{isa = PBXGroup; children = {array(refs+testrefs+[products])}; sourceTree = "<group>";}}')
def phase(name,kind,files):return obj(name,f'{{isa = {kind}; buildActionMask = 2147483647; files = {array(files)}; runOnlyForDeploymentPostprocessing = 0;}}')
sp=phase('sources','PBXSourcesBuildPhase',sources);rp=phase('resources','PBXResourcesBuildPhase',resources);fp=phase('frameworks','PBXFrameworksBuildPhase',[])
tsp=phase('testsources','PBXSourcesBuildPhase',testbuild);tfp=phase('testframeworks','PBXFrameworksBuildPhase',[])
def configs(name,extra):
    cs=[]
    for variant in ['Debug','Release']:
        opts='SWIFT_OPTIMIZATION_LEVEL = "-Onone"; DEBUG_INFORMATION_FORMAT = dwarf;' if variant=='Debug' else 'SWIFT_OPTIMIZATION_LEVEL = "-O"; DEBUG_INFORMATION_FORMAT = "dwarf-with-dsym";'
        cs.append(obj(name+variant,f'{{isa = XCBuildConfiguration; buildSettings = {{{opts}{extra}}}; name = {variant};}}'))
    return obj(name+'configlist',f'{{isa = XCConfigurationList; buildConfigurations = {array(cs)}; defaultConfigurationIsVisible = 0; defaultConfigurationName = Release;}}')
pc=configs('project','IPHONEOS_DEPLOYMENT_TARGET = 17.0; SDKROOT = iphoneos; SWIFT_VERSION = 5.0; CLANG_ENABLE_MODULES = YES;')
ac=configs('app','PRODUCT_NAME = Pulse; PRODUCT_BUNDLE_IDENTIFIER = com.jo3lnta.pulse; INFOPLIST_FILE = Pulse/Info.plist; CODE_SIGN_ENTITLEMENTS = Pulse/Pulse.entitlements; CODE_SIGN_STYLE = Automatic; TARGETED_DEVICE_FAMILY = 1; CURRENT_PROJECT_VERSION = 1; MARKETING_VERSION = 1.0; ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon; GENERATE_INFOPLIST_FILE = NO; ENABLE_TESTABILITY = YES;')
app=obj('app',f'{{isa = PBXNativeTarget; buildConfigurationList = {ac}; buildPhases = {array([sp,fp,rp])}; buildRules = (); dependencies = (); name = Pulse; productName = Pulse; productReference = {appref}; productType = "com.apple.product-type.application";}}')
proxy=obj('proxy',f'{{isa = PBXContainerItemProxy; containerPortal = {uid("project")}; proxyType = 1; remoteGlobalIDString = {app}; remoteInfo = Pulse;}}')
dep=obj('dep',f'{{isa = PBXTargetDependency; target = {app}; targetProxy = {proxy};}}')
tc=configs('test','PRODUCT_NAME = PulseTests; PRODUCT_BUNDLE_IDENTIFIER = com.jo3lnta.pulse.tests; GENERATE_INFOPLIST_FILE = YES; TEST_HOST = "$(BUILT_PRODUCTS_DIR)/Pulse.app/$(BUNDLE_EXECUTABLE_FOLDER_PATH)/Pulse"; BUNDLE_LOADER = "$(TEST_HOST)"; TARGETED_DEVICE_FAMILY = 1; CODE_SIGN_STYLE = Automatic;')
target=obj('testtarget',f'{{isa = PBXNativeTarget; buildConfigurationList = {tc}; buildPhases = {array([tsp,tfp])}; buildRules = (); dependencies = {array([dep])}; name = PulseTests; productName = PulseTests; productReference = {testref}; productType = "com.apple.product-type.bundle.unit-test";}}')
project=obj('project',f'{{isa = PBXProject; attributes = {{LastUpgradeCheck = 1600; TargetAttributes = {{{app} = {{SystemCapabilities = {{com.apple.HealthKit = {{enabled = 1;}};}};}};}};}}; buildConfigurationList = {pc}; compatibilityVersion = "Xcode 14.0"; developmentRegion = es; knownRegions = (es,en,Base); mainGroup = {main}; productRefGroup = {products}; projectDirPath = ""; projectRoot = ""; targets = {array([app,target])};}}')
out='// !$*UTF8*$!\n{archiveVersion = 1; classes = {}; objectVersion = 56; objects = {\n'+''.join(f'{k} = {v};\n' for k,v in objects.items())+'}; rootObject = '+project+'; }\n'
(root/'Pulse.xcodeproj').mkdir(exist_ok=True)
(root/'Pulse.xcodeproj/project.pbxproj').write_text(out)
scheme=f'''<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="1600" version="1.3"><BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{app}" BuildableName="Pulse.app" BlueprintName="Pulse" ReferencedContainer="container:Pulse.xcodeproj"/></BuildActionEntry></BuildActionEntries></BuildAction><TestAction buildConfiguration="Debug"><Testables><TestableReference skipped="NO"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{target}" BuildableName="PulseTests.xctest" BlueprintName="PulseTests" ReferencedContainer="container:Pulse.xcodeproj"/></TestableReference></Testables></TestAction><LaunchAction buildConfiguration="Debug" launchStyle="0"><BuildableProductRunnable runnableDebuggingMode="0"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{app}" BuildableName="Pulse.app" BlueprintName="Pulse" ReferencedContainer="container:Pulse.xcodeproj"/></BuildableProductRunnable></LaunchAction><ProfileAction buildConfiguration="Release"/><AnalyzeAction buildConfiguration="Debug"/><ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/></Scheme>'''
path=root/'Pulse.xcodeproj/xcshareddata/xcschemes/Pulse.xcscheme';path.parent.mkdir(parents=True,exist_ok=True);path.write_text(scheme)
