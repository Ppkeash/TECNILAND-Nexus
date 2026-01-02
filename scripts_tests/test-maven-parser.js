/**
 * Test script for Maven coordinate parser
 * Run with: node scripts/test-maven-parser.js
 */

// Mock parseMavenCoordinate function (copy from BaseLoaderInstaller)
function parseMavenCoordinate(coordinate) {
    if (!coordinate || typeof coordinate !== 'string') {
        throw new Error(`Invalid Maven coordinate: ${coordinate}`)
    }
    
    // Split by @ to extract extension first
    const [mainPart, extPart] = coordinate.split('@')
    const ext = extPart || 'jar' // Default extension is jar
    
    // Split main part by :
    const parts = mainPart.split(':')
    
    if (parts.length < 3) {
        throw new Error(`Invalid Maven coordinate format: ${coordinate} (expected at least group:artifact:version)`)
    }
    
    const group = parts[0]
    const artifact = parts[1]
    const version = parts[2]
    const classifier = parts.length >= 4 ? parts[3] : null
    
    return { group, artifact, version, ext, classifier }
}

// Test cases
const testCases = [
    {
        input: 'net.neoforged.fancymodloader:earlydisplay:1.0.16@jar',
        expected: {
            group: 'net.neoforged.fancymodloader',
            artifact: 'earlydisplay',
            version: '1.0.16',
            ext: 'jar',
            classifier: null
        }
    },
    {
        input: 'org.example:lib:1.0.0',
        expected: {
            group: 'org.example',
            artifact: 'lib',
            version: '1.0.0',
            ext: 'jar',
            classifier: null
        }
    },
    {
        input: 'org.lwjgl:lwjgl-glfw:3.3.1:natives-linux',
        expected: {
            group: 'org.lwjgl',
            artifact: 'lwjgl-glfw',
            version: '3.3.1',
            ext: 'jar',
            classifier: 'natives-linux'
        }
    },
    {
        input: 'net.fabricmc:fabric-loader:0.15.11',
        expected: {
            group: 'net.fabricmc',
            artifact: 'fabric-loader',
            version: '0.15.11',
            ext: 'jar',
            classifier: null
        }
    },
    {
        input: 'net.neoforged:neoforge:20.4.196@jar',
        expected: {
            group: 'net.neoforged',
            artifact: 'neoforge',
            version: '20.4.196',
            ext: 'jar',
            classifier: null
        }
    }
]

console.log('Testing Maven Coordinate Parser\n')
console.log('='.repeat(80))

let passed = 0
let failed = 0

for (const test of testCases) {
    try {
        const result = parseMavenCoordinate(test.input)
        
        // Compare results
        const match = 
            result.group === test.expected.group &&
            result.artifact === test.expected.artifact &&
            result.version === test.expected.version &&
            result.ext === test.expected.ext &&
            result.classifier === test.expected.classifier
        
        if (match) {
            console.log(`✅ PASS: ${test.input}`)
            console.log(`   Result: ${JSON.stringify(result)}\n`)
            passed++
        } else {
            console.log(`❌ FAIL: ${test.input}`)
            console.log(`   Expected: ${JSON.stringify(test.expected)}`)
            console.log(`   Got:      ${JSON.stringify(result)}\n`)
            failed++
        }
        
    } catch (error) {
        console.log(`❌ ERROR: ${test.input}`)
        console.log(`   ${error.message}\n`)
        failed++
    }
}

console.log('='.repeat(80))
console.log(`Results: ${passed} passed, ${failed} failed`)

// Test URL generation for NeoForge libraries
console.log('\n' + '='.repeat(80))
console.log('Testing URL Generation for NeoForge Libraries\n')

const testUrls = [
    {
        coord: 'net.neoforged.fancymodloader:earlydisplay:1.0.16@jar',
        expected: 'https://maven.neoforged.net/releases/net/neoforged/fancymodloader/earlydisplay/1.0.16/earlydisplay-1.0.16.jar'
    },
    {
        coord: 'cpw.mods:securejarhandler:2.1.24@jar',
        expected: 'https://maven.neoforged.net/releases/cpw/mods/securejarhandler/2.1.24/securejarhandler-2.1.24.jar'
    },
    {
        coord: 'net.minecraftforge:srgutils:0.4.15@jar',
        expected: 'https://maven.neoforged.net/releases/net/minecraftforge/srgutils/0.4.15/srgutils-0.4.15.jar'
    },
    {
        coord: 'net.fabricmc:fabric-loader:0.15.11',
        expected: 'https://repo1.maven.org/maven2/net/fabricmc/fabric-loader/0.15.11/fabric-loader-0.15.11.jar'
    }
]

let urlPassed = 0
let urlFailed = 0

for (const test of testUrls) {
    const parsed = parseMavenCoordinate(test.coord)
    const { group, artifact, version, ext, classifier } = parsed
    
    const groupPath = group.replace(/\./g, '/')
    const classifierSuffix = classifier ? `-${classifier}` : ''
    const jarName = `${artifact}-${version}${classifierSuffix}.${ext}`
    
    const repoBaseUrl = (group.startsWith('net.neoforged') || group.startsWith('cpw.mods') || group.startsWith('net.minecraftforge'))
        ? 'https://maven.neoforged.net/releases/'
        : 'https://repo1.maven.org/maven2/'
    
    const url = `${repoBaseUrl}${groupPath}/${artifact}/${version}/${jarName}`
    
    console.log(`Coordinate: ${test.coord}`)
    console.log(`Generated:  ${url}`)
    console.log(`Expected:   ${test.expected}`)
    
    if (url === test.expected) {
        console.log('✅ PASS\n')
        urlPassed++
    } else {
        console.log('❌ FAIL\n')
        urlFailed++
    }
}

console.log('='.repeat(80))
console.log(`URL Generation: ${urlPassed} passed, ${urlFailed} failed`)
console.log('='.repeat(80))

process.exit(failed > 0 || urlFailed > 0 ? 1 : 0)
