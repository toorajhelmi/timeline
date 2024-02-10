namespace Apsy.Xi.Zar.Code
{
    public enum MenthodType { Get, Post, Put, Delete }

    public class Method
    {
        public string Name { get; set; }
        public string ReturnType { get; set; }
        public MenthodType MenthodType { get; set; }
        public List<string> Parameters { get; set; } = [];
        public List<CodeBlock> CodeBlocks { get; set; } = [];
    }
}
