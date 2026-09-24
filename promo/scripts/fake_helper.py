import sys, urllib.request
args = sys.argv[1:]
url = 'http://127.0.0.1:4010/fastf1/' + '/'.join(args)
print(urllib.request.urlopen(url).read().decode())
