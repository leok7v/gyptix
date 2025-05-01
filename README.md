# GyPTix: Chat with GPT AI on Apple Devices

GyPTix is an AI-powered app designed for Apple devices, prioritizing **privacy** and **offline** use. Here’s what it offers:

- **Offline AI:** It runs entirely on your device, requiring no internet connection. This makes it ideal for offline scenarios and ensures that your data stays private.

- **Privacy-Focused:** It is built with privacy in mind. It does not collect personal data, store conversations, or share any information—your interactions remain completely private.

- **Free & Open-Source:** It is free to use, with open-source code available for community contributions and transparency.

- **GPT-Based:** Utilizing **GPT (Generative Pre-trained Transformer)** models, GyPTix generates human-like text for a wide range of tasks.

- **Available on iOS & macOS:** Use GyPTix on your **iPhone, iPad, and Mac**.

GyPTix app provides a **secure, private, and offline AI experience**, allowing you to interact with powerful language models anytime, anywhere—without compromising privacy.

## Try GyPTix:

🌀 **[Download on the App Store](https://apps.apple.com/us/app/gyptix/id6741091005)**
   - Available for **iPhone, iPad, and macOS**.

🔹 **[Join the Beta Program on TestFlight](https://apps.apple.com/us/app/gyptix/id6741091005)**
   - Get access to the latest beta versions.

📺 **Why GyPTix?**
   - [![Watch on YouTube](https://img.youtube.com/vi/WgS3qm5V8OE/default.jpg)](https://youtu.be/WgS3qm5V8OE)

# Build for command line use:

```
git clone --recursive https://github.com/leok7v/gyptix.git
```

```
make
```

```
scripts/download.sh
```

```
scripts/run.sh
```

# Build GyPTix UI:

```
open xcode/gyptix.xcodeproj
```
  
_To Avoid Annoying warnings from Apple:_  

xCode Edit Scheme -> Arguments -> Environment Variables  
```
Name:                  Value:
OS_ACTIVITY_MODE       disable
```
