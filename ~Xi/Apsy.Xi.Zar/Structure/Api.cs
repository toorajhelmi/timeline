using Apsy.Xi.Basic;

namespace Apsy.Xi.Zar.Structure
{
    public class Api : Block
    {
        public string Name { get; set; }
        public List<Method> Methods { get; set; } = [];
    }
}
